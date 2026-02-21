// Services
export { getBrandKit, updateBrandKit } from './services/brand-kit-service';
export {
  generateDocument,
  renderTemplate,
  applyBrandKit,
  convertFormat,
} from './services/document-generation-service';
export {
  createSignRequest,
  getSignStatus,
  cancelSignRequest,
} from './services/esign-service';
export {
  getDefaultTemplates,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
} from './services/template-service';
export {
  createVersion,
  getVersions,
  getVersion,
  generateRedline,
  rollbackToVersion,
} from './services/versioning-service';

// Types
export type {
  DocumentTemplate,
  TemplateVariable,
  DocumentGeneration,
  DocumentVersion,
  Redline,
  RedlineChange,
  ESignRequest,
  BrandKitConfig,
  PresentationSlide,
} from './types';
