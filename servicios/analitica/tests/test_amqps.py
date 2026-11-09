"""B2: en la nube basta la URL. aiormq lee la CA propia de `?cafile=` y verifica el certificado (sin código propio)."""

from aiormq import Connection


def test_amqps_toma_la_ca_de_la_url() -> None:
    conexion = Connection("amqps://analitica:x@mq.transporte.example:5671/?cafile=/secretos/ca.pem")
    assert (conexion.url.scheme, conexion.ssl_certs.cafile, conexion.ssl_certs.verify) == (
        "amqps",
        "/secretos/ca.pem",
        True,
    )


def test_amqp_sin_tls_como_en_local() -> None:
    assert Connection("amqp://analitica:x@rabbitmq:5672/").ssl_certs.cafile is None
