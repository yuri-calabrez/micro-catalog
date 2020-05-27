import {bind, /* inject, */ BindingScope} from '@loopback/core';
import {repository} from '@loopback/repository';
import {GenreRepository} from '../repositories';
import {Message} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';

@bind({scope: BindingScope.TRANSIENT})
export class GenreSyncService {
  constructor(@repository(GenreRepository) private genreRepository: GenreRepository) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/genre',
    routingKey: 'model.genre.*'
  })
  async handler({data, message}: {data: any, message: Message}) {
    const action = message.fields.routingKey.split('.')[2]

    switch (action) {
      case 'created':
        await this.genreRepository.create(data)
        break

      case 'updated':
        await this.genreRepository.updateById(data.id, data)
        break

      case 'deleted':
        await this.genreRepository.deleteById(data.id)
        break
    }
  }
}
