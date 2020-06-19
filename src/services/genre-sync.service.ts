import {bind, /* inject, */ BindingScope, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GenreRepository} from '../repositories';
import {Message} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {BaseModelSyncService} from './base-model-sync.service';
import {ValidatorService} from './validator.service';

@bind({scope: BindingScope.SINGLETON})
export class GenreSyncService extends BaseModelSyncService {
  constructor(
    @repository(GenreRepository) private repository: GenreRepository,
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
}
