import {BootMixin} from '@loopback/boot';
import {ApplicationConfig, Application} from '@loopback/core';
import {RestExplorerBindings} from '@loopback/rest-explorer';
import {RepositoryMixin} from '@loopback/repository';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {MySequence} from './sequence';
import {RabbitMqServer} from './servers';
import {RestComponent, RestServer} from '@loopback/rest';
import {RestExplorerComponent, ValidatorsComponent} from './components';
import {ValidatorService} from './services/validator.service';
import {UpdateCategoryRelationObserver} from './observers/update-category-relation.observer';

export class MicroCatalogApplication extends BootMixin(
  ServiceMixin(RepositoryMixin(Application)),
) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    options.rest.sequence = MySequence;
    this.component(RestComponent)
    const reserServer = this.getSync<RestServer>('servers.RestServer')
    reserServer.static('/', path.join(__dirname, '../public'));

    // Set up the custom sequence


    // Set up default home page
    //this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);
    this.component(ValidatorsComponent);
    this.lifeCycleObserver(UpdateCategoryRelationObserver)
    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    this.server(RabbitMqServer)
  }

  async boot() {
    await super.boot()

    /* categoryRepo = this.getSync('repositories.CategoryRepository')
    //@ts-ignore
    const category = await categoryRepo.find({where: {id: '1-cat'}})
    //@ts-ignore
    categoryRepo.updateById(category[0].id, {...category[0], name: "Funcionou!!!"});*/
  }
}
