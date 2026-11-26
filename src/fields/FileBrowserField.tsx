import { useState, useRef } from "react";
import { useUpdateNodeInternals } from '@xyflow/react'

import { FieldProps } from "../components/NodeContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import CloseIcon from '@mui/icons-material/Close';
import config from "../../app.config";
import { useSettingsStore } from "../stores/useSettingsStore";
import InputField from "./InputField";
import IconButton from "@mui/material/IconButton";
import { useFlowStore } from "../stores/useFlowStore";
import { useStoredName } from "../utils/storedName";

export default function FileBrowserField(props: FieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setFileBrowserOpener = useSettingsStore(state => state.setFileBrowserOpener);
  const [isDropActive, setIsDropActive] = useState(false);
  const updateNodeInternals = useUpdateNodeInternals();
  // ours: a link or a Library pick (sha256:…) is no folder to browse
  const currentPath = props.value?.length > 0 && Array.isArray(props.value) && !/^(sha256:|[a-z]+:\/\/)/.test(props.value[0])
    ? props.value[0].split(/[/\\]/).slice(0, -1).join('/') 
    : '.';

  const fieldTypes = props.fieldOptions?.fileTypes || ['image'];
  const allowImages = fieldTypes.includes('image');
  const allowVideos = fieldTypes.includes('video');

  const getAcceptString = () => {
    const accepts = [];
    if (allowImages) accepts.push('image/*');
    if (allowVideos) accepts.push('video/*');
    return accepts.join(',');
  };

  const isImage = (file: string) => file.match(/\.(jpe?g|a?png|webp|gif|bmp|ico|tiff|svg)$/i);
  const isVideo = (file: string) => file.match(/\.(mp4|webm|ogg)$/i);
  const isUrl = (file: string) => file.startsWith('http://') || file.startsWith('https://');

  // if none of the values is empty, add an empty string to allow adding more files
  const fieldValue = (props.fieldOptions?.multiple && allowImages && props.value && !props.value.includes('') ? [...props.value, ''] : props.value) || [''];
  const displayValue = fieldValue.filter((file: string) => isImage(file) || isVideo(file)) || [];
  const isTextFieldEditable = props.fieldOptions?.editable !== false;

  // The file's path on the server once uploaded; the field is updated once for all of a pick or a drop (addFiles), since
  // props.value is the field's value from before them
  async function uploadFile(file: File): Promise<string[]> {
    const formData = new FormData();
    formData.append('file', file);
    const fileType = file.type.startsWith('image/') ? 'images' : 'videos';
    formData.append('type', fileType);
    try {
      const response = await fetch(`${config.serverAddress}/file`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!data.error) {
        return Array.isArray(data.path) ? data.path : [data.path];
      }
      console.error(data.error);
    } catch (error) {
      console.error(error);
    }
    return [];
  }

  // Every image of a pick or a drop, added to the field's own if it takes several; else the first file, a video
  // always alone
  async function addFiles(picked: File[]) {
    const files = picked.filter(file =>
      (allowImages && file.type.startsWith('image/')) ||
      (allowVideos && file.type.startsWith('video/'))
    );
    if (files.length === 0) return;
    const several = props.fieldOptions?.multiple && allowImages && !files[0].type.startsWith('video/');
    const newFiles: string[] = [];
    for (const file of several ? files.filter(f => f.type.startsWith('image/')) : files.slice(0, 1)) {
      newFiles.push(...await uploadFile(file));
    }
    if (newFiles.length === 0) return;
    props.updateStore(props.fieldKey, several ?
      Array.from(new Set([...(props.value || []).filter((f: string) => f), ...newFiles])) :
      newFiles);
  }

  async function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDropActive(false);
    await addFiles([...e.dataTransfer.files]);
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    await addFiles([...(e.target.files || [])]);
    e.target.value = '';  // so picking the same file again is a change
  }

  const handleMediaLoad = () => {
    // Update node internals after the image/video has loaded and the node has re-rendered
    setTimeout(() => {
      updateNodeInternals(props.nodeId);
    }, 100);
  };

  const updateArrayValues = (value: string, key?: number) => {
    const newValues = props.value ? [...props.value] : [];
    if (key !== undefined) {
      newValues[key] = value;
    } else {
      newValues.push(value);
    }
    // ours: a single file's field emptied holds "", as the shipped graphs do, not [] (another key, and no text box)
    const files = Array.from(new Set(newValues.filter(f => f)));
    props.updateStore(props.fieldKey, files.length || props.fieldOptions?.multiple ? files : '');
  };

  const getGridColumns = (count: number) => {
    if (count <= 1) return 1;
    const maxCols = 4;
    const cols = Math.ceil(Math.sqrt(count));
    return Math.min(cols, maxCols);
  };

  const removeMedia = (fileToRemove: string) => {
    const newValues = props.value?.filter((file: string) => file !== fileToRemove) || [];
    if (newValues.length === 0) {
      props.updateStore(props.fieldKey, ['']);
    } else {
      props.updateStore(props.fieldKey, newValues);
    }
    queueMicrotask(() => {
      updateNodeInternals(props.nodeId);
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        ...props.style,
      }}
      data-key={props.fieldKey}
      className={`${props.hidden ? 'mellon-hidden' : ''} mellon-field`}
    >
      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 0.5 }}>
          { isTextFieldEditable ? (
            fieldValue.map((file: string, index: number) => (
              <FileInput
                key={index}
                {...props}
                value={file}
                part={fieldValue.length > 1 ? index + 1 : undefined}
                updateStore={(_, file) => updateArrayValues(file, index)}
                clear={() => updateArrayValues('', index)}
              />
            ))
          ) : (
            fieldValue.map((file: string, index: number) => (
              <Typography key={index} variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-all', color: 'text.secondary', bgcolor: 'background.default', px: 1, py: 0.5, borderRadius: 0.5 }}>
                {file}
              </Typography>
            ))
          )}
        </Box>
        <IconButton
          size="small"
          sx={{ ml: 0.5, flexGrow: 0 }}
          title="Open file browser"
          onClick={() => setFileBrowserOpener({
            nodeId: props.nodeId,
            fieldKey: props.fieldKey,
            fileTypes: props.fieldOptions?.fileTypes,
            path: currentPath,
            multiple: props.fieldOptions?.multiple ?? false,
            initialValues: props.value,
          })}
        >
          <FolderOpenOutlinedIcon />
        </IconButton>
      </Box>

      {/* Hidden file input for OS file dialog */}
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptString()}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        multiple={props.fieldOptions?.multiple && allowImages}
      />

      {/** File drop area */}
      <Box
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDropActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDropActive(false); }}
        onDrop={handleFileDrop}
        sx={{
          cursor: 'pointer',
          width: '100%',
          height: '100%',
          border: '1px dashed',
          borderRadius: 0,
          p: 1,
          mt: 1,
          textAlign: 'center',
          overflow: 'hidden',
          borderColor: isDropActive ? 'text.secondary' : 'divider',
          backgroundColor: isDropActive ? 'success.dark' : 'transparent',
          display: 'grid',
          gridTemplateColumns: `repeat(${getGridColumns(displayValue.length)}, 1fr)`,
          gap: 1,
          '&>div>img': {
            display: 'block',
            margin: '0 auto',
            maxWidth: '360px',
            maxHeight: '1024px',
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          },
          " &>div>video": {
            display: 'block',
            margin: '0 auto',
            maxWidth: '1920px',
            maxHeight: '1080px',
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }
        }}
      >
        {displayValue && displayValue.length > 0 ? (
          displayValue.map((file: string, index: number) => (
            <Box key={index} sx={{ position: 'relative' }}>
              {isImage(file) ? (
                <img
                  src={isUrl(file) ? file : `${config.serverAddress}/preview?file=${encodeURIComponent(file)}`}
                  alt={file}
                  onLoad={handleMediaLoad}
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).src =
                      "data:image/svg+xml;utf8,<svg width='512' height='512' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='checker' width='32' height='32' patternUnits='userSpaceOnUse'><rect width='32' height='32' fill='%23ffffff11'/><rect x='0' y='0' width='16' height='16' fill='%23ffffff33'/><rect x='16' y='16' width='16' height='16' fill='%23ffffff33'/></pattern></defs><rect width='512' height='512' fill='url(%23checker)'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='24' fill='%23FAFAFA' font-family='JetBrains Mono, monospace'>Image not found</text></svg>";
                  }}
                />
              ) : isVideo(file) ? (
                <video
                  src={isUrl(file) ? file : `${config.serverAddress}/stream?file=${encodeURIComponent(file)}`}
                  //src={`${config.serverAddress}/cache/${props.nodeId}/${props.fieldKey}`}
                  controls
                  onClick={e => { e.stopPropagation() }}
                  onLoadedData={e => {
                    (e.currentTarget as HTMLVideoElement).poster = '';
                    handleMediaLoad();
                  }}
                  onError={e => {
                    (e.currentTarget as HTMLVideoElement).poster =
                      "data:image/svg+xml;utf8,<svg width='512' height='512' xmlns='http://www.w3.org/2000/svg'><defs><pattern id='checker' width='32' height='32' patternUnits='userSpaceOnUse'><rect width='32' height='32' fill='%23ffffff11'/><rect x='0' y='0' width='16' height='16' fill='%23ffffff33'/><rect x='16' y='16' width='16' height='16' fill='%23ffffff33'/></pattern></defs><rect width='512' height='512' fill='url(%23checker)'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='24' fill='%23FAFAFA' font-family='JetBrains Mono, monospace'>Video not found</text></svg>";
                  }}
                />
              ) : null}
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); removeMedia(file); }}
                title="Remove image"
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    color: 'error.main',
                  }
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">
            Drop files here to upload
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ours: a file named by its content (a Library pick's sha256:<hex>) shows its library entry's name (numbered among
// several), not to be typed over: its X clears it, as deleting its text would
function FileInput({ part, clear, ...props }: FieldProps & { part?: number; clear: () => void }) {
  const folder: string | undefined = useFlowStore(s => s.nodes.find(n => n.id === props.nodeId)?.data.params.repo_id?.value);
  const name = useStoredName(props.value, folder);
  if (!name) return <InputField {...props} />;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'background.default', px: 1, py: 0.5, borderRadius: 0.5 }} title={props.value}>
      {props.label && <Typography sx={{ fontSize: 13, color: 'text.secondary', pr: 1, whiteSpace: 'nowrap' }}>{props.label}</Typography>}
      <Typography sx={{ fontSize: 14, flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{part ? `${name} · ${part}` : name}</Typography>
      <IconButton size="small" className="nodrag" title="Clear" sx={{ p: 0 }} onClick={clear}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}
