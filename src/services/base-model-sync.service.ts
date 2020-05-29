import {Message} from 'amqplib';
import {DefaultCrudRepository} from '@loopback/repository';
import {pick} from 'lodash'

export interface SyncOptions {
  repository: DefaultCrudRepository<any, any>
  data: any
  message: Message
}


export abstract class BaseModelSyncService {

  protected async sync({repository, data, message}: SyncOptions) {
    const action = this.getAction(message)
    const entity = this.createEntity(data, repository)
    const {id} = data || {}

    switch (action) {
      case 'created':
        await repository.create(entity)
        break

      case 'updated':
        await this.updateOrCreate({repository, id, entity})
        break

      case 'deleted':
        await repository.deleteById(id)
        break
    }
  }

  protected getAction(message: Message) {
    return message.fields.routingKey.split('.')[2]
  }

  protected createEntity(data: any, repository: DefaultCrudRepository<any, any>) {
    return pick(data, Object.keys(repository.entityClass.definition.properties))
  }

  protected async updateOrCreate({repository, id, entity}: {repository: DefaultCrudRepository<any, any>, id: string, entity: any}) {
    const exists = repository.exists(id)

    return exists ? repository.updateById(id, entity) : repository.create(entity)
  }
}
