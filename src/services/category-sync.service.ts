import {bind, /* inject, */ BindingScope, service} from '@loopback/core';
import {rabbitmqSubscribe} from '../decorators';
import {repository} from '@loopback/repository';
import {CategoryRepository} from '../repositories';
import {Message} from 'amqplib';
import {BaseModelSyncService} from './base-model-sync.service';
import {ValidatorService} from './validator.service';
import {ResponseEnum} from '../servers';

@bind({scope: BindingScope.SINGLETON})
export class CategorySyncService extends BaseModelSyncService {
  constructor(
    @repository(CategoryRepository) private repository: CategoryRepository,
    @service(ValidatorService) private validate: ValidatorService
  ) {
    super(validate)
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/category',
    routingKey: 'model.category.*',
    queueOptions: {
      deadLetterExchange: 'dlx.amq.topic'
    }
  })
  async handler({data, message}: {data: any, message: Message}) {
    //await this.sleep(10000)
    //return ResponseEnum.NECK
    await this.sync({
      repository: this.repository,
      data,
      message
    })
  }

  /*sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }*/
}
