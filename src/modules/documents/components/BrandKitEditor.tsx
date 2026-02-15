'use client';

import React, { useState } from 'react';
import type { BrandKitConfig } from '../types';

interface Props {
  config: BrandKitConfig;
  onSave: (config: BrandKitConfig) => void;
}

export function BrandKitEditor({ config, onSave }: Props) {
  const [local, setLocal] = useState(config);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h3 style={{ fontWeight: 600 }}>Brand Kit</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Primary Color</label>
          <input type="color" value={local.primaryColor} onChange={(e) => setLocal({ ...local, primaryColor: e.target.value })} style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Secondary Color</label>
          <input type="color" value={local.secondaryColor} onChange={(e) => setLocal({ ...local, secondaryColor: e.target.value })} style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer' }} />
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Font Family</label>
        <select value={local.fontFamily} onChange={(e) => setLocal({ ...local, fontFamily: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="'Helvetica Neue', sans-serif">Helvetica</option>
          <option value="'Times New Roman', serif">Times New Roman</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>Logo URL</label>
        <input type="text" value={local.logoUrl || ''} onChange={(e) => setLocal({ ...local, logoUrl: e.target.value })} placeholder="https://..." style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
      </div>
      <button onClick={() => onSave(local)} style={{ padding: '10px 24px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, alignSelf: 'flex-start' }}>
        Save Brand Kit
      </button>
    </div>
  );
}
