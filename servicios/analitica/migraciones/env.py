from alembic import context
from sqlalchemy import create_engine

from app.configuracion import configuracion

with create_engine(configuracion().database_url).connect() as conexion:
    context.configure(connection=conexion)
    with context.begin_transaction():
        context.run_migrations()
