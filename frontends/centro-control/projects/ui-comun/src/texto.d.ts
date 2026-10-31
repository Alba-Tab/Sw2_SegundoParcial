/** Archivos que las pruebas importan como texto (`with { loader: 'text' }` del builder de Angular). */
declare module '*.graphql' {
  const texto: string;
  export default texto;
}
