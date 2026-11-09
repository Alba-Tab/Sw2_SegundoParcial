package bo.transporte.viajes.adaptadores.salida.almacen;

import bo.transporte.viajes.aplicacion.puerto.salida.AlmacenEvidencias;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3 con URL firmadas (D40a). En local apunta a RustFS con estilo de ruta: el servidor usa {@code almacen.endpoint}
 * (red del compose) y las URL se firman con {@code almacen.endpoint-publico}, el que alcanza el celular. Sin endpoint,
 * AWS con la cadena de credenciales por defecto.
 */
@Component
class AlmacenS3 implements AlmacenEvidencias {
    private static final Duration SUBIDA = Duration.ofMinutes(15);
    private static final Duration DESCARGA = Duration.ofMinutes(5);

    private final S3Client s3;
    private final S3Presigner firmador;
    private final String bucket;

    AlmacenS3(
            @Value("${almacen.endpoint:}") String endpoint,
            @Value("${almacen.endpoint-publico:}") String endpointPublico,
            @Value("${almacen.bucket}") String bucket,
            @Value("${almacen.region}") String region,
            @Value("${almacen.clave-acceso:}") String claveAcceso,
            @Value("${almacen.clave-secreta:}") String claveSecreta) {
        this.bucket = bucket;
        AwsCredentialsProvider credenciales = claveAcceso.isBlank()
                ? DefaultCredentialsProvider.builder().build()
                : StaticCredentialsProvider.create(AwsBasicCredentials.create(claveAcceso, claveSecreta));
        var config = S3Configuration.builder()
                .pathStyleAccessEnabled(!endpoint.isBlank())
                .build();
        var cliente = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(credenciales)
                .serviceConfiguration(config);
        var presigner = S3Presigner.builder()
                .region(Region.of(region))
                .credentialsProvider(credenciales)
                .serviceConfiguration(config);
        if (!endpoint.isBlank()) {
            cliente.endpointOverride(URI.create(endpoint));
            presigner.endpointOverride(URI.create(endpointPublico.isBlank() ? endpoint : endpointPublico));
        }
        this.s3 = cliente.build();
        this.firmador = presigner.build();
    }

    @Override
    public String iniciar(String llave, String contentType) {
        return llamar(
                () -> s3.createMultipartUpload(b -> b.bucket(bucket).key(llave).contentType(contentType))
                        .uploadId());
    }

    @Override
    public List<UrlFirmada> urlsDePartes(String llave, String uploadId, List<Integer> numeros) {
        Instant expira = Instant.now().plus(SUBIDA);
        return numeros.stream()
                .map(n -> new UrlFirmada(
                        n,
                        firmador.presignUploadPart(f -> f.signatureDuration(SUBIDA)
                                        .uploadPartRequest(p -> p.bucket(bucket)
                                                .key(llave)
                                                .uploadId(uploadId)
                                                .partNumber(n)))
                                .url()
                                .toString(),
                        expira))
                .toList();
    }

    @Override
    public List<Parte> partesSubidas(String llave, String uploadId) {
        return llamar(() -> {
            List<Parte> partes = new ArrayList<>();
            s3.listPartsPaginator(b -> b.bucket(bucket).key(llave).uploadId(uploadId))
                    .parts()
                    .forEach(p -> partes.add(new Parte(p.partNumber(), p.eTag())));
            return partes;
        });
    }

    @Override
    public long completar(String llave, String uploadId, List<Parte> partes) {
        var completadas = partes.stream()
                .sorted(Comparator.comparingInt(Parte::numero))
                .map(p -> CompletedPart.builder()
                        .partNumber(p.numero())
                        .eTag(p.etag())
                        .build())
                .toList();
        try {
            s3.completeMultipartUpload(
                    b -> b.bucket(bucket).key(llave).uploadId(uploadId).multipartUpload(m -> m.parts(completadas)));
        } catch (S3Exception e) {
            if (e.statusCode() == 400)
                throw new PartesInvalidas(e.awsErrorDetails().errorMessage(), e);
            throw new NoDisponible("S3 no completó la subida", e);
        } catch (SdkException e) {
            throw new NoDisponible("S3 no completó la subida", e);
        }
        return llamar(() -> s3.headObject(b -> b.bucket(bucket).key(llave)).contentLength());
    }

    @Override
    public UrlFirmada urlDeDescarga(String llave) {
        var url = firmador.presignGetObject(f -> f.signatureDuration(DESCARGA)
                .getObjectRequest(g -> g.bucket(bucket).key(llave)));
        return new UrlFirmada(0, url.url().toString(), Instant.now().plus(DESCARGA));
    }

    private interface Llamada<T> {
        T hacer();
    }

    private static <T> T llamar(Llamada<T> llamada) {
        try {
            return llamada.hacer();
        } catch (SdkException e) {
            throw new NoDisponible("S3 no responde: " + e.getMessage(), e);
        }
    }
}
