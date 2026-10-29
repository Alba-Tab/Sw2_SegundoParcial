package bo.transporte.viajes;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/** Hexagonal (AGENTS.md): dominio sin Spring ni adaptadores; los puertos viven en aplicacion. */
@AnalyzeClasses(packages = "bo.transporte.viajes", importOptions = ImportOption.DoNotIncludeTests.class)
class ArquitecturaTest {

	@ArchTest
	static final ArchRule capas = layeredArchitecture().consideringOnlyDependenciesInLayers()
		.layer("Dominio").definedBy("..dominio..")
		.layer("Aplicacion").definedBy("..aplicacion..")
		.layer("Adaptadores").definedBy("..adaptadores..")
		.layer("Configuracion").definedBy("..configuracion..")
		.whereLayer("Adaptadores").mayOnlyBeAccessedByLayers("Configuracion")
		.whereLayer("Aplicacion").mayOnlyBeAccessedByLayers("Adaptadores", "Configuracion")
		.whereLayer("Dominio").mayOnlyBeAccessedByLayers("Aplicacion", "Adaptadores", "Configuracion");

	@ArchTest
	static final ArchRule dominioSinFrameworks = noClasses().that().resideInAPackage("..dominio..")
		.should().dependOnClassesThat().resideInAnyPackage("org.springframework..", "jakarta..", "tools.jackson..",
			"com.fasterxml..", "org.hibernate..", "io.temporal..");

	@ArchTest
	static final ArchRule aplicacionSinInfraestructura = noClasses().that().resideInAPackage("..aplicacion..")
		.should().dependOnClassesThat().resideInAnyPackage("org.springframework.amqp..", "org.springframework.jdbc..",
			"org.springframework.web..", "jakarta.persistence..", "software.amazon..");
}
