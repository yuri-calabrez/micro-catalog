import {bind, /* inject, */ BindingScope, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GenreRepository, CategoryRepository} from '../repositories';
import {Message} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {BaseModelSyncService} from './base-model-sync.service';
import {ValidatorService} from './validator.service';

@bind({scope: BindingScope.SINGLETON})
export class GenreSyncService extends BaseModelSyncService {
  constructor(
    @repository(GenreRepository) private repository: GenreRepository,
    @repository(CategoryRepository) private categoryRepo: CategoryRepository,
    @service(ValidatorService) private validate: ValidatorService
  ) {
    super(validate)
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/genre',
    routingKey: 'model.genre.*'
  })
  async handler({data, message}: {data: any, message: Message}) {
    await this.sync({
      repository: this.repository,
      data,
      message
    })
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/genre_categories',
    routingKey: 'model.genre_categories.*'
  })
  async handlerCategories({data, message}: {data: any, message: Message}) {
    await this.syncRelations({
      id: data.id,
      relationIds: data.relation_ids,
      repoRelation: this.categoryRepo,
      message
    })
  }
}
