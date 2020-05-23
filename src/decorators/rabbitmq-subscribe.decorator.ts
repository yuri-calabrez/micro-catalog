import {Options} from 'amqplib';
import {MethodDecoratorFactory} from '@loopback/core';

export interface RabbitmqSubscribeMetadata {
  exchange: string
  routingKey: string | string[]
  queue?: string
  queueOptions?: Options.AssertQueue
}

export const RABBITMQ_SUBSCRIBE_DECORATOR = 'rabbitmq_subscribe_metadata'

export function rabbitmqSubscribe(spec: RabbitmqSubscribeMetadata): MethodDecorator {
  return MethodDecoratorFactory.createDecorator<RabbitmqSubscribeMetadata>(RABBITMQ_SUBSCRIBE_DECORATOR, spec)
}
