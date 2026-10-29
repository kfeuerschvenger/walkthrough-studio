import { useRef } from 'react';
import Button from '../atoms/Button';
import Hint from '../atoms/Hint';
import PanelSection from '../molecules/PanelSection';
import { ACCEPTED_IMAGE_TYPES } from '../../features/scene/api';
import type { Texture } from '../../features/painting/types';

type Props = {
  /** Every uploaded texture, in display order. */
  textures: Texture[];
  /** Texture armed for painting, or `null` when none is. */
  selectedTextureId: string | null;
  /** Receives the files the user picked in the file dialog. */
  onLoadFiles: (files: FileList) => void;
  /** Selects a texture for painting; `null` clears the selection. */
  onSelectTexture: (id: string | null) => void;
  /** Deletes a texture. Called only after the user confirmed. */
  onDeleteTexture: (id: string) => void;
};

/**
 * Grid of texture thumbnails plus the "load image" button.
 *
 * The hidden `<input type="file">` is driven by the button so we get the
 * native file picker without exposing the ugly default input, and it only
 * offers the formats the server accepts. Clicking a thumbnail toggles
 * selection. The small "×" is a separate button beside the thumbnail (a
 * button cannot contain another interactive control); it asks for
 * confirmation before deleting.
 */
export default function TextureGrid({
  textures,
  selectedTextureId,
  onLoadFiles,
  onSelectTexture,
  onDeleteTexture,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <PanelSection
      title="Texturas"
      action={
        <Button onClick={() => fileInputRef.current?.click()}>+ Cargar</Button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) {
            onLoadFiles(event.target.files);
            event.target.value = '';
          }
        }}
      />

      {textures.length === 0 ? (
        <Hint empty>Cargá imágenes para empezar.</Hint>
      ) : (
        <div className="tt-tex-grid">
          {textures.map((texture) => (
            <div key={texture.id} className="tt-tex-item">
              <button
                type="button"
                className={`tt-tex-card ${texture.id === selectedTextureId ? 'is-selected' : ''}`}
                aria-pressed={texture.id === selectedTextureId}
                onClick={() =>
                  onSelectTexture(texture.id === selectedTextureId ? null : texture.id)
                }
                title={texture.filename}
              >
                <img src={texture.url} alt={texture.filename} />
                <span className="tt-tex-card__name">{texture.filename}</span>
              </button>
              <button
                type="button"
                className="tt-tex-card__delete"
                aria-label={`Borrar textura ${texture.filename}`}
                onClick={() => {
                  const message = `¿Borrar la textura "${texture.filename}"? También se quitará de las superficies donde está aplicada.`;
                  if (window.confirm(message)) onDeleteTexture(texture.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}
