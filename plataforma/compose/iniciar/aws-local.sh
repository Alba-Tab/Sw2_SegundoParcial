#!/bin/sh
# DynamoDB Local (spec 005, D55) y el bucket de evidencias en el S3 local (spec 006). Idempotente.
set -eu
D="aws dynamodb --endpoint-url http://dynamodb-local:8000"
until $D list-tables >/dev/null 2>&1; do sleep 2; done
$D describe-table --table-name gps_puntos >/dev/null 2>&1 || $D create-table --table-name gps_puntos \
  --attribute-definitions AttributeName=viajeId,AttributeType=S AttributeName=tsSeq,AttributeType=S \
  --key-schema AttributeName=viajeId,KeyType=HASH AttributeName=tsSeq,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=20,WriteCapacityUnits=20 >/dev/null
$D update-time-to-live --table-name gps_puntos --time-to-live-specification Enabled=true,AttributeName=expiraEn >/dev/null 2>&1 || true
$D describe-table --table-name sync_cursor >/dev/null 2>&1 || $D create-table --table-name sync_cursor \
  --attribute-definitions AttributeName=dispositivoId,AttributeType=S AttributeName=viajeId,AttributeType=S \
  --key-schema AttributeName=dispositivoId,KeyType=HASH AttributeName=viajeId,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 >/dev/null
echo "dynamodb: $($D list-tables --query 'TableNames' --output text)"
S="aws s3api --endpoint-url http://s3-local:9000"
until $S list-buckets >/dev/null 2>&1; do sleep 2; done
$S head-bucket --bucket "$S3_BUCKET" >/dev/null 2>&1 || $S create-bucket --bucket "$S3_BUCKET" >/dev/null
# D67: subidas multipart abandonadas se abortan a los 7 días.
$S put-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"abortar-multipart","Status":"Enabled","Filter":{"Prefix":""},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}]}' >/dev/null 2>&1 \
  || echo "aviso: el S3 local no acepta la regla de ciclo de vida (en AWS sí se aplica)"
echo "s3: bucket $S3_BUCKET listo"
