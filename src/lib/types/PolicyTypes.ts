export interface PolicyState {
//   isSelected: boolean;
  mode: 'disabled' | 'readonly' | 'full';
//   template: PolicyTemplate | null;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  providers: Provider[];
}

export interface Provider {
    name : string;
    permissions : any[];
}