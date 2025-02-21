export interface NamedEntity {
  type: 'PERSON' | 'TIME' | 'DATE' | 'DURATION' | 'LOCATION';
  text: string;
  confidence: number;
}
