'use client';

import React, { useState } from 'react';
import type { RolePermission } from '../types';

interface Props {
  roles: RolePermission[];
  onCreateRole: (role: Omit<RolePermission, 'roleId'>) => void;
  onAssignRole: (userId: string, roleId: string) => void;
}

export function RoleConfig({ roles, onCreateRole, onAssignRole }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [permissions, setPermissions] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');

  const handleCreate = () => {
    onCreateRole({
      roleName,
      permissions: permissions.split(',').map((p) => p.trim()).filter(Boolean),
      entityScope: [],
      isDefault: false,
    });
    setRoleName('');
    setPermissions('');
    setShowForm(false);
  };

  const handleAssign = () => {
    if (assignUserId && assignRoleId) {
      onAssignRole(assignUserId, assignRoleId);
      setAssignUserId('');
      setAssignRoleId('');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontWeight: 600, fontSize: '16px' }}>Roles & Permissions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {showForm ? 'Cancel' : 'New Role'}
        </button>
      </div>

      {showForm && (
        <div style={{ padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Role Name</label>
            <input value={roleName} onChange={(e) => setRoleName(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Permissions (comma-separated)</label>
            <input value={permissions} onChange={(e) => setPermissions(e.target.value)} placeholder="tasks.read, tasks.write, documents.read" style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <button onClick={handleCreate} style={{ padding: '8px 16px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Create Role
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {roles.map((role) => (
          <div key={role.roleId} style={{ padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{role.roleName}</span>
              {role.isDefault && <span style={{ marginLeft: '8px', padding: '2px 6px', backgroundColor: '#dbeafe', color: '#1e40af', borderRadius: '12px', fontSize: '11px' }}>Default</span>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {role.permissions.map((perm) => (
                  <span key={perm} style={{ padding: '1px 6px', backgroundColor: '#f3f4f6', borderRadius: '4px', fontSize: '11px', color: '#6b7280' }}>{perm}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
        <h4 style={{ fontWeight: 500, marginBottom: '8px' }}>Assign Role</h4>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>User ID</label>
            <input value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Role</label>
            <select value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
              <option value="">Select role</option>
              {roles.map((r) => <option key={r.roleId} value={r.roleId}>{r.roleName}</option>)}
            </select>
          </div>
          <button onClick={handleAssign} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}
