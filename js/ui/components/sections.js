const SECTION_DEFS = {
  disease: [
    { key: 'etiology', label: 'Etiology' },
    { key: 'pathophys', label: 'Pathophys' },
    { key: 'clinical', label: 'Clinical Presentation' },
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'treatment', label: 'Treatment' },
    { key: 'complications', label: 'Complications' },
    { key: 'mnemonic', label: 'Mnemonic' }
  ],
  drug: [
    { key: 'moa', label: 'Mechanism' },
    { key: 'uses', label: 'Uses' },
    { key: 'sideEffects', label: 'Side Effects' },
    { key: 'contraindications', label: 'Contraindications' },
    { key: 'mnemonic', label: 'Mnemonic' }
  ],
  concept: [
    { key: 'definition', label: 'Definition' },
    { key: 'mechanism', label: 'Mechanism' },
    { key: 'clinicalRelevance', label: 'Clinical Relevance' },
    { key: 'example', label: 'Example' },
    { key: 'mnemonic', label: 'Mnemonic' }
  ]
};

export function sectionDefsForKind(kind) {
  return SECTION_DEFS[kind] || [];
}

export function allSectionDefs() {
  return SECTION_DEFS;
}
