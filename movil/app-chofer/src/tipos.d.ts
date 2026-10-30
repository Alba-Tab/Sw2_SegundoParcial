declare module '*.sql' {
  const sql: string;
  export default sql;
}

// Assets de Metro: el import devuelve el id del asset.
declare module '*.tflite' {
  const asset: number;
  export default asset;
}
declare module '*.wav' {
  const asset: number;
  export default asset;
}
