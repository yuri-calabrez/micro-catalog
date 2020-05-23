import {bind, /* inject, */ BindingScope} from '@loopback/core';
import {rabbitmqSubscribe} from '../decorators';
import {repository} from '@loopback/repository';
import {CategoryRepository} from '../repositories';

@bind({scope: BindingScope.TRANSIENT})
export class CategorySyncService {
  constructor(
    @repository(CategoryRepository) private categoryRepository: CategoryRepository,
  ) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'x1',
    routingKey: 'model.category.*'
  })
  handler() {
    console.log(this.categoryRepository.entityClass)
  }
}
