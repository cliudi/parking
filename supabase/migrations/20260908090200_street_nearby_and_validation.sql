begin;
-- Existing RPC signatures and grants remain unchanged.
CREATE OR REPLACE FUNCTION public.parkings_nearby(lat double precision, lng double precision, radius_m integer DEFAULT 2000, only_free boolean DEFAULT false, only_ev boolean DEFAULT false, max_price integer DEFAULT NULL::integer, lim integer DEFAULT 100) RETURNS TABLE(id uuid, name text, address text, lat_out double precision, lng_out double precision, category public.parking_category, kind public.parking_kind, price_type public.price_type, price_hour integer, capacity integer, capacity_est boolean, hours text, is_247 boolean, has_ev boolean, ev_connectors text[], height_limit numeric, photos text[], source public.data_source, verified_at date, distance_m double precision)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select
    p.id, p.name, p.address,
    st_y(p.location::geometry), st_x(p.location::geometry),
    p.category, p.kind,
    p.price_type, p.price_hour,
    p.capacity, p.capacity_est,
    p.hours, p.is_247,
    p.has_ev, p.ev_connectors,
    p.height_limit, p.photos,
    p.source, p.verified_at,
    st_distance(case when p.category='STREET_ALLOWED' then p.road_line else p.location end, st_makepoint(lng, lat)::geography)
  from parkings p
  where p.status = 'APPROVED'
    and (p.category<>'STREET_ALLOWED' or (p.road_line is not null and p.price_type::text in ('free','paid') and p.street_details->>'parking_side' in ('left','right','both')))
    and st_dwithin(case when p.category='STREET_ALLOWED' then p.road_line else p.location end, st_makepoint(lng, lat)::geography, radius_m)
    and (not only_free or p.price_type = 'free')
    and (not only_ev   or p.has_ev)
    and (max_price is null or coalesce(p.price_hour, 0) <= max_price)
  order by st_distance(case when p.category='STREET_ALLOWED' then p.road_line else p.location end, st_makepoint(lng, lat)::geography),p.id
  limit greatest(1,least(coalesce(lim,100),500));
$$;

CREATE OR REPLACE FUNCTION public.parkly_parking_publish_errors(p_id uuid) RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p public.parkings%rowtype;
  errors text[] := array[]::text[];
  normalized_name text;
  effective_name text;
  is_admin_record boolean;
  lat double precision;
  lng double precision;
  duplicate_id uuid;
  exact_tariff boolean;
  tariff_confirmed boolean;
begin
  select * into p from public.parkings where id=p_id;
  if not found then return array['Парковка не найдена.']; end if;

  if p.status<>'DRAFT' then
    errors := array_append(errors,'Опубликовать можно только парковку со статусом DRAFT.');
  end if;

  is_admin_record := p.source::text='ADMIN';
  effective_name := coalesce(
    nullif(btrim(p.name),''),
    nullif(btrim(p.address),''),
    nullif(btrim(p.district),'')
  );
  normalized_name := lower(regexp_replace(btrim(coalesce(effective_name,'')), '\s+', ' ', 'g'));

  if not is_admin_record and normalized_name in (
    '', 'парковка', 'новая парковка', 'без названия',
    'parking', 'new parking', 'unnamed'
  ) then
    errors := array_append(errors,
      'Укажите понятное название парковки или объекта, возле которого она находится.');
  end if;

  if p.location is null then
    errors := array_append(errors,'Не указаны координаты парковки.');
  else
    lat := st_y(p.location::geometry);
    lng := st_x(p.location::geometry);
    if lat is null or lng is null or lat < -90 or lat > 90 or lng < -180 or lng > 180 then
      errors := array_append(errors,'Координаты парковки некорректны.');
    end if;
  end if;

  if nullif(btrim(p.address),'') is null then
    errors := array_append(errors,'Не указан адрес или понятное описание местоположения.');
  end if;
  if nullif(btrim(p.district),'') is null then
    errors := array_append(errors,'Не определён район.');
  end if;
  if not is_admin_record and p.verified_at is null then
    errors := array_append(errors,'Не указана дата проверки парковки.');
  end if;
  if p.source is null then
    errors := array_append(errors,'Не указан источник данных.');
  elsif not is_admin_record and nullif(btrim(p.source_ref),'') is null then
    errors := array_append(errors,'Для внешней записи отсутствует ссылка или идентификатор источника.');
  end if;
  if p.price_type is null then
    errors := array_append(errors,'Не указан тип стоимости.');
  end if;

  if p.has_free_period and coalesce(p.free_period_minutes,0)<=0 then
    errors := array_append(errors,'Укажите продолжительность бесплатного периода.');
  end if;
  if p.price_after_free_period is not null and not p.has_free_period then
    errors := array_append(errors,'Цена после бесплатного периода указана без самого бесплатного периода.');
  end if;
  if p.has_free_period and p.price_type::text<>'paid' then
    errors := array_append(errors,'Парковка с ограниченным бесплатным периодом должна иметь price_type=paid.');
  end if;
  if p.has_barrier
     and not coalesce(p.barrier_at_entry,false)
     and not coalesce(p.barrier_at_exit,false)
     and nullif(btrim(p.entry_rules),'') is null
     and nullif(btrim(p.exit_rules),'') is null then
    errors := array_append(errors,'Уточните расположение шлагбаума или правила въезда/выезда.');
  end if;

  exact_tariff := p.price_hour is not null
    or p.price_day is not null
    or p.price_after_free_period is not null;
  tariff_confirmed := is_admin_record or (
      nullif(btrim(p.tariff_source_ref),'') is not null
      and p.tariff_verified_at is not null
    ) or (
      coalesce(p.tariff_admin_verified,false)
      and p.tariff_verified_by is not null
      and p.tariff_verified_at is not null
      and nullif(btrim(p.tariff_verification_method),'') is not null
    );
  if exact_tariff and not tariff_confirmed then
    errors := array_append(errors,
      'Точный тариф внешней записи требует источника либо подтверждения администратором.');
  end if;

  select other.id into duplicate_id
  from public.parkings other
  where other.id<>p.id
    and other.status='APPROVED'
    and (p.category<>'STREET_ALLOWED' or other.category<>'STREET_ALLOWED' or (p.street_path=other.street_path and p.street_details->>'parking_side'=other.street_details->>'parking_side'))
    and other.location is not null
    and p.location is not null
    and (
      (nullif(btrim(p.source_ref),'') is not null and other.source_ref=p.source_ref)
      or (
        st_dwithin(p.location,other.location,5)
        and lower(regexp_replace(btrim(coalesce(other.name,'')), '\s+', ' ', 'g'))
          = normalized_name
      )
    )
  order by st_distance(p.location,other.location)
  limit 1;
  if duplicate_id is not null then
    errors := array_append(errors,format('Найден критический возможный дубль: %s.',duplicate_id));
  end if;

  if p.category='STREET_ALLOWED' then
    if p.street_path is null then errors:=array_append(errors,'Нарисуйте уличный участок.'); end if;
    if coalesce(p.street_details->>'parking_side','') not in ('left','right','both') then errors:=array_append(errors,'Укажите сторону улицы.'); end if;
    if p.price_type::text not in ('free','paid') then errors:=array_append(errors,'Для публикации укажите стоимость: бесплатно или платно.'); end if;
  end if;
  return errors;
end;
$$;
notify pgrst,'reload schema';
commit;
