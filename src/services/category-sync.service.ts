import {bind, /* inject, */ BindingScope} from '@loopback/core';
import {rabbitmqSubscribe} from '../decorators';
import {repository} from '@loopback/repository';
import {CategoryRepository} from '../repositories';
import {Message} from 'amqplib';

@bind({scope: BindingScope.TRANSIENT})
export class CategorySyncService {
  constructor(
    @repository(CategoryRepository) private categoryRepository: CategoryRepository,
  ) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/category',
    routingKey: 'model.category.*'
  })
  async handler({data, message}: {data: any, message: Message}) {
    const action = message.fields.routingKey.split('.')[2]

    switch (action) {
      case 'created':
        await this.categoryRepository.create(data)
        break

      case 'updated':
        await this.categoryRepository.updateById(data.id, data)
        break

      case 'deleted':
        await this.categoryRepository.deleteById(data.id)
        break
    }
  }
}
