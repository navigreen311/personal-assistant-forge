'use client';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function ScriptValidationPanel({ result }: { result: ValidationResult | null }) {
  if (!result) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        Click &quot;Validate&quot; to check script for errors
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <h4 className={`text-sm font-semibold mb-2 ${result.valid ? 'text-green-800' : 'text-red-800'}`}>
        {result.valid ? 'Script is valid' : `${result.errors.length} error(s) found`}
      </h4>
      {result.errors.length > 0 && (
        <ul className="space-y-1">
          {result.errors.map((err, i) => (
            <li key={i} className="text-sm text-red-700 flex items-start gap-1">
              <span className="text-red-400 mt-0.5">*</span>
              {err}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
