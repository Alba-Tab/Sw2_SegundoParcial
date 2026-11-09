"""Errores de negocio con el código estable de 000 §5. La API los traduce a Problem Details."""


class ErrorDeDominio(Exception):
    def __init__(self, codigo: str, mensaje: str, campo: str | None = None) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje
        self.campo = campo
