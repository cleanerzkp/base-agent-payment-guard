import { Attribution } from 'ox/erc8021';
import type { Hex } from 'viem';
import { BASE_BUILDER_CODE } from '../deployment';

export const BASE_BUILDER_CODE_SUFFIX = Attribution.toDataSuffix({
  codes: [BASE_BUILDER_CODE],
}) as Hex;
