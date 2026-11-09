package bo.transporte.viajes.adaptadores.temporal;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.google.protobuf.ByteString;
import io.temporal.api.common.v1.Payload;
import io.temporal.common.converter.DataConverter;
import io.temporal.common.converter.DataConverterException;
import io.temporal.common.converter.DefaultDataConverter;
import io.temporal.common.converter.EncodingKeys;
import io.temporal.common.converter.PayloadConverter;
import java.lang.reflect.Type;
import java.util.Optional;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * JSON con Jackson 3 según el contrato: sin campos null y fallando ante campos desconocidos (en Jackson 3 viene
 * desactivado). El Jackson3JsonPayloadConverter del SDK 1.40 no acepta un JsonMapper propio (PoC-2).
 */
public final class ConversorTemporal implements PayloadConverter {
    public static final JsonMapper MAPPER = JsonMapper.builder()
            .changeDefaultPropertyInclusion(i -> i.withValueInclusion(JsonInclude.Include.NON_NULL))
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    private static final String CODIFICACION = "json/plain";

    public static DataConverter dataConverter() {
        return DefaultDataConverter.newDefaultInstance().withPayloadConverterOverrides(new ConversorTemporal());
    }

    @Override
    public String getEncodingType() {
        return CODIFICACION;
    }

    @Override
    public Optional<Payload> toData(Object valor) throws DataConverterException {
        try {
            return Optional.of(Payload.newBuilder()
                    .putMetadata(EncodingKeys.METADATA_ENCODING_KEY, ByteString.copyFromUtf8(CODIFICACION))
                    .setData(ByteString.copyFrom(MAPPER.writeValueAsBytes(valor)))
                    .build());
        } catch (RuntimeException e) {
            throw new DataConverterException(e);
        }
    }

    @Override
    public <T> T fromData(Payload payload, Class<T> clase, Type tipo) throws DataConverterException {
        try {
            return MAPPER.readValue(payload.getData().toByteArray(), MAPPER.constructType(tipo));
        } catch (RuntimeException e) {
            throw new DataConverterException(payload, new Class<?>[] {clase}, e);
        }
    }
}
