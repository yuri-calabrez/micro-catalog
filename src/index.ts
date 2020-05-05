import "./bootstrap";
import {ApplicationConfig} from '@loopback/core';
import {MicroCatalogApplication} from './application';

export {MicroCatalogApplication};

export async function main(options: ApplicationConfig = {}) {
  const app = new MicroCatalogApplication(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`Server is running at ${url}`);
  console.log(`Try ${url}/ping`);

  return app;
}
