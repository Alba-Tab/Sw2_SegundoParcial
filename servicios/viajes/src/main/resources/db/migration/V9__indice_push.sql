-- D45: el consumidor de push busca cada 2 s los eventos publicados de los tipos que avisan; sin índice recorría todo el
-- outbox. Solo mira el último día: un aviso más viejo ya no le sirve al chofer (la app sincroniza al abrir).
CREATE INDEX outbox_eventos_publicados_por_tipo ON outbox_eventos (tipo, publicado_en) WHERE publicado_en IS NOT NULL;
