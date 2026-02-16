'use client';

import React, { useState } from 'react';
import type { SSOConfig as SSOConfigType } from '../types';

interface Props {
  config: SSOConfigType;
  onSave: (config: Partial<SSOConfigType>) => void;
  onToggle: (enabled: boolean) => void;
}

export function SSOConfig({ config, onSave, onToggle }: Props) {
  const [provider, setProvider] = useState<SSOConfigType['provider']>(config.provider);
  const [issuerUrl, setIssuerUrl] = useState(config.issuerUrl || '');
  const [clientId, setClientId] = useState(config.clientId || '');
  const [fingerprint, setFingerprint] = useState(config.certificateFingerprint || '');

  const handleSave = () => {
    onSave({ provider, issuerUrl: issuerUrl || undefined, clientId: clientId || undefined, certificateFingerprint: fingerprint || undefined });
  };

  return (
    <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontWeight: 600 }}>SSO Configuration</h3>
        <button
          onClick={() => onToggle(!config.isEnabled)}
          style={{
            padding: '4px 12px', borderRadius: '12px', fontSize: '13px', border: 'none', cursor: 'pointer',
            backgroundColor: config.isEnabled ? '#dcfce7' : '#f3f4f6',
            color: config.isEnabled ? '#166534' : '#6b7280',
          }}
        >
          {config.isEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value as SSOConfigType['provider'])} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
            <option value="NONE">None</option>
            <option value="SAML">SAML 2.0</option>
            <option value="OIDC">OpenID Connect</option>
          </select>
        </div>
        {provider !== 'NONE' && (
          <>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Issuer URL</label>
              <input value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)} placeholder="https://idp.example.com" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Client ID</label>
              <input value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Certificate Fingerprint</label>
              <input value={fingerprint} onChange={(e) => setFingerprint(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', fontFamily: 'monospace' }} />
            </div>
          </>
        )}
        <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', alignSelf: 'flex-start' }}>
          Save Configuration
        </button>
      </div>
    </div>
  );
}
