import {Message} from 'amqplib';
import {DefaultCrudRepository, EntityNotFoundError} from '@loopback/repository';
import {pick} from 'lodash'
import {ValidatorService} from './validator.service';

export interface SyncOptions {
  repository: DefaultCrudRepository<any, any>
  data: any
  message: Message
}

export interface SyncRelationOptions {
  id: string
  repository: DefaultCrudRepository<any, any>
  relationName: string
  relationIds: string[]
  relationRepo: DefaultCrudRepository<any, any>,
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
    repository,
    relationName,
    relationIds,
    relationRepo,
    message
  }: SyncRelationOptions) {
    const fieldsRelation = this.extractFieldsRelations(repository, relationName)

    const collection = await relationRepo.find({
      where: {
        or: relationIds.map((idRelation) => ({id: idRelation})),
      },
      fields: fieldsRelation
    })

    if (!collection.length) {
      const error = new EntityNotFoundError(relationRepo.entityClass, relationIds)
      error.name = 'EntityNotFound'
      throw error
    }

    const action = this.getAction(message)
    if (action === "attached") {
      await (repository as any).attachRelation(id, relationName, collection)
    }
  }

  protected extractFieldsRelations(repository: DefaultCrudRepository<any, any>, relation: string) {
    return Object.keys(
      repository.modelClass.definition.properties[relation].jsonSchema.items.properties
    ).reduce((obj: any, field: string) => {
      obj[field] = true
      return obj
    }, {})
  }
}
