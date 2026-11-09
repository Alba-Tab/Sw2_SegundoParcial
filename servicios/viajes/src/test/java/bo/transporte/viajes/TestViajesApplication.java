package bo.transporte.viajes;

import org.springframework.boot.SpringApplication;

public class TestViajesApplication {

    public static void main(String[] args) {
        SpringApplication.from(ViajesApplication::main)
                .with(TestcontainersConfiguration.class)
                .run(args);
    }
}
