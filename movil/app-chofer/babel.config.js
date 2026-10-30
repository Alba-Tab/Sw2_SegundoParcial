// Drizzle importa las migraciones .sql como texto (drizzle-orm/expo-sqlite/migrator).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
