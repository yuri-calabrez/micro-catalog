import {bind, /* inject, */ BindingScope} from '@loopback/core';
import {repository} from '@loopback/repository';
import {CastMemberRepository} from '../repositories';
import {rabbitmqSubscribe} from '../decorators';
import {Message} from 'amqplib';
import {BaseModelSyncService} from './base-model-sync.service';

@bind({scope: BindingScope.SINGLETON})
export class CastMemberSyncService extends BaseModelSyncService {
  constructor(@repository(CastMemberRepository) private repository: CastMemberRepository) {
    super()
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/cast_member',
    routingKey: 'model.cast_member.*'
  })
  async handler({data, message}: {data: any, message: Message}) {
    await this.sync({
      repository: this.repository,
      data,
      message
    })
  }
}
