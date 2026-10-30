CREATE TABLE `evidencia_local` (
	`evidencia_id` text PRIMARY KEY NOT NULL,
	`viaje_id` text NOT NULL,
	`tipo` text NOT NULL,
	`archivo` text NOT NULL,
	`content_type` text NOT NULL,
	`tamano_bytes` integer NOT NULL,
	`estado` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `operacion_pendiente` ADD `evidencias` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `viaje` ADD `entrega_local` text;