package bo.transporte.viajes.aplicacion.puerto.salida;

import java.util.Map;

/** Push al celular del chofer (D45). En iPhone no hay push con la cuenta gratuita de Apple: solo tokens de Android. */
public interface NotificadorPush {
    enum Resultado {
        ENVIADO,
        /** FCM ya no reconoce el token (app desinstalada o token rotado): se borra del dispositivo. */
        TOKEN_INVALIDO,
        /** Sin proyecto de FCM configurado (por ejemplo, en las pruebas): se omite sin error. */
        OMITIDO,
        ERROR
    }

    record Mensaje(String titulo, String cuerpo, Map<String, String> datos, String agrupar) {}

    Resultado enviar(String tokenPush, Mensaje mensaje);
}
