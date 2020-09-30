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
  relation: string
  relationIds: string[]
  repository: DefaultCrudRepository<any, any>
  repoRelation: DefaultCrudRepository<any, any>
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
    relation,
    relationIds,
    repository,
    repoRelation
  }: SyncRelationOptions) {
    const fieldsRelation = this.extractFieldsRelations(repository, relation)

    const collection = await repoRelation.find({
      where: {
        or: relationIds.map((idRelation) => ({id: idRelation})),
      },
      fields: fieldsRelation
    })

    if (!collection.length) {
      const error = new EntityNotFoundError(repoRelation.entityClass, relationIds)
      error.name = 'EntityNotFound'
      throw error
    }

    //await repository.updateById(id, {[relation]: collection})
    //TODO: passar para repositorio generico
    await (repository as any).attachCategories(id, collection)
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
