/* eslint-disable no-console */
import dataSource from '../data-source';

async function run() {
  await dataSource.initialize();
  console.log('Connected. (No seeds defined yet — add them to src/database/seeds/*.)');
  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
