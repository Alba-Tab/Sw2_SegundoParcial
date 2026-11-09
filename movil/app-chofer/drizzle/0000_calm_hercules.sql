CREATE TABLE `ajuste` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `operacion_pendiente` (
	`op_id` text PRIMARY KEY NOT NULL,
	`viaje_id` text NOT NULL,
	`tipo` text NOT NULL,
	`cuerpo` text NOT NULL,
	`creada_en` text NOT NULL,
	`intentos` integer DEFAULT 0 NOT NULL,
	`proximo_intento_en` text,
	`estado` text NOT NULL,
	`codigo_error` text,
	`cerrada_en` text
);
--> statement-breakpoint
CREATE TABLE `punto_gps` (
	`viaje_id` text NOT NULL,
	`seq` integer NOT NULL,
	`registrada_en` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`velocidad_kmh` real NOT NULL,
	`precision_metros` real,
	PRIMARY KEY(`viaje_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `viaje` (
	`viaje_id` text PRIMARY KEY NOT NULL,
	`estado` text NOT NULL,
	`datos` text NOT NULL,
	`iniciado_local` integer DEFAULT false NOT NULL,
	`cancelado_al_sincronizar` integer DEFAULT false NOT NULL,
	`actualizado_en` text NOT NULL
);
