# Job n8n-importar de la nube (B8): importar.sh con los flujos adentro. Las credenciales salen del entorno del Job.
FROM n8nio/n8n:2.46.2
COPY importar.sh /n8n/importar.sh
COPY flujos /flujos
ENTRYPOINT ["sh", "/n8n/importar.sh"]
