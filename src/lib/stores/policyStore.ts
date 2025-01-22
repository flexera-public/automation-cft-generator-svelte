import { writable } from 'svelte/store';
import type { PolicyState } from '../types/PolicyTypes';

export const policyStates = writable<Record<string, PolicyState>>({});