import {Message} from 'amqplib';
import {DefaultCrudRepository} from '@loopback/repository';
import {pick} from 'lodash'
import {ValidatorService} from './validator.service';

export interface SyncOptions {
  repository: DefaultCrudRepository<any, any>
  data: any
  message: Message
}


export abstract class BaseModelSyncService {

  constructor(public valiateService: ValidatorService) {

  }

  protected async sync({repository, data, message}: SyncOptions) {
    const action = this.getAction(message)
    const entity = this.createEntity(data, repository)
    const {id} = data || {}

    switch (action) {
      case 'created':
        await this.valiateService.validate({
          data: entity,
          entityClass: repository.entityClass
        })
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
    const exists = await repository.exists(id)

    await this.valiateService.validate({
      data: entity,
      entityClass: repository.entityClass,
      ...(exists && {options: {partial: true}})
    })

    return exists ? repository.updateById(id, entity) : repository.create(entity)
  }

  async syncRelations({
    id,
    relationIds,
    repoRelation
  }: {
    id: string,
    relationIds: string[],
    repoRelation: DefaultCrudRepository<any, any>,
    message: Message
  }) {
    const collection = await repoRelation.find({
      where: {
        or: relationIds.map((idRelation) => ({id: idRelation})),
      }
    })
    console.log(collection)
  }
}
