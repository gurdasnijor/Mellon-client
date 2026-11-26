import { lazy, memo, ReactNode, Suspense } from 'react';
import { NodeParams } from '../stores/useNodeStore';
import { deepEqual } from '../utils/deepEqual';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';

import HandleField from '../fields/HandleField';
import InputField from '../fields/InputField';
import FileBrowserField from '../fields/FileBrowserField';
import SelectField from '../fields/SelectField';
import RandomField from '../fields/RandomField';
import ToggleField from '../fields/ToggleField';
import AutocompleteField from '../fields/AutocompleteField';
import TextareaField from '../fields/TextareaField';
import RadioField from '../fields/RadioField';
import NumberField from '../fields/NumberField';
import RangeField from '../fields/RangeField';
import SplineField from '../fields/SplineField';
import ModelSelectField from '../fields/ModelSelectField';
import LayerConfigField from '../fields/LayerConfigField';
import SelectDialogField from '../fields/SelectDialogField';

import UITextField from '../fields/UITextField';
import UIImageField from '../fields/UIImageField';
import UIButtonField from '../fields/UIButtonField';
import UILabelFieldField from '../fields/UILabelField';
import UIGroupField from '../fields/UIGroupField';
import UIImagecompareField from '../fields/UIImagecompareField';
import UIVideoField from '../fields/UIVideoField';

export type FieldProps = {
  nodeId: string;
  fieldKey: string;
  label: string;
  display: string;
  disabled: boolean;
  hidden: boolean;
  style: Record<string, any>;
  value: any;
  default: any;
  options: any[] | Record<string | number | symbol, any>;
  optionsSource?: Record<string, any>;
  dataType: string;
  fieldType: string;
  updateStore: (param: string, value: any, key?: keyof NodeParams) => void;
  module: string;
  action: string;
  isConnected?: boolean;
  onChange?: any;
  min?: number;
  max?: number;
  step?: number;
  fieldOptions?: Record<string, any>;
  onSignal?: any;
  signal?: any;
  children?: ReactNode;
}

const NodeContent = ({
  nodeId,
  params,
  updateStore,
  module,
  action,
  groupHandles = false,
  only,
  pins,
  }: {
    nodeId: string,
    params: NodeParams,
    updateStore: (param: string, value: any, key?: keyof NodeParams) => void,
    module: string,
    action: string,
    groupHandles?: boolean,
    only?: string[], // ours: just these fields, as a folded group's face shows them
    pins?: Pins, // ours: a pin on each field a node's group can show folded
  }) => {
  const fields = Object.entries(params).filter(([key]) => !only || only.includes(key)).map(([key, data]: [string, NodeParams]) => {
    const label = data.label ?? (key.charAt(0).toUpperCase() + key.slice(1));
    const display = (data.isInput ? 'input' : data.display || '');
    const dataType = ((Array.isArray(data.type) && data.type.length > 0 ? data.type[0] : data.type || 'string') as string);
    const fieldType = getFieldType(display, dataType, data.options);
    const hidden = data.hidden || false;
    const value = data.value ?? data.default;
    const isConnected = display === 'input' || display === 'output' ? data.isConnected || false : undefined;

    const props = {
      nodeId,
      value,
      label,
      display,
      isConnected,
      dataType,
      fieldType,
      hidden,
      updateStore,
      module,
      action,
      onChange: data.onChange,
      fieldKey: key,
      default: data.default,
      options: data.options || [],
      style: data.style || {},
      disabled: data.disabled || false,
      min: data.min,
      max: data.max,
      step: data.step,
      fieldOptions: data.fieldOptions || {},
      optionsSource: data.optionsSource || {},
      signal: data.signal,
      onSignal: data.onSignal,
    };

    return { key, props };
  });

  if (groupHandles) {
    const inputs = fields.filter(({ props }) => props.fieldType === 'input');
    const outputs = fields.filter(({ props }) => props.fieldType === 'output');
    const others = fields.filter(({ props }) => props.fieldType !== 'input' && props.fieldType !== 'output');

    return (
      <>
        {inputs.length > 0 && (
          <Box sx={{
            position: 'absolute',
            left: -20,
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: 'secondary.dark',
            py: 0.5,
            borderRadius: '3px',
            '& .MuiTypography-root': {
              fontSize: '12px',
            },
          }}>
            {inputs.map(({ key, props }) => <FieldMemo key={key} {...props} />)}
          </Box>
        )}
        {outputs.length > 0 && (
          <Box sx={{
            position: 'absolute',
            right: -20,
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: 'secondary.dark',
            py: 0.5,
            borderRadius: '3px',
            '& .MuiTypography-root': {
              fontSize: '12px',
            },
          }}>
            {outputs.map(({ key, props }) => <FieldMemo key={key} {...props} />)}
          </Box>
        )}
        {others.length > 0 && (
          <Box>
            {others.map(({ key, props }) => <FieldMemo key={key} {...props} />)}
          </Box>
        )}
      </>
    );
  }

  // Search `ui_group` fields and collect their children
  const groupFields: Record<string, { props: FieldProps; children: { key: string; props: FieldProps }[] }> = {};
  const groupedFieldKeys = new Set<string>();

  fields.forEach(({ key, props }) => {
    if (props.fieldType === 'ui_group' && Array.isArray(props.options)) {
      groupFields[key] = { props, children: [] };
      props.options.forEach((option) => {
        const child = fields.find(field => field.key === option);
        if (child && !groupedFieldKeys.has(option)) {
          groupFields[key].children.push(child);
          groupedFieldKeys.add(option); // Mark as grouped
        }
      });
    }
  });

  // Build the final ordered list of fields to render
  const orderedFields = fields
    .filter(({ key }) => !groupedFieldKeys.has(key)) // Exclude children of groups from the top level
    .map(({ key, props }) => {
      if (groupFields[key]) {
        // This is a group, render it with its children
        const group = groupFields[key];
        return (
          <GroupMemo key={key} {...props}>
            {group.children.map(({ key: childKey, props: childProps }) => (
              <Pinned key={childKey} fieldKey={childKey} pins={pins}><FieldMemo {...childProps} /></Pinned> /* ours: pins */
            ))}
          </GroupMemo>
        );
      }
      // This is a regular field
      return <Pinned key={key} fieldKey={key} pins={pins}><FieldMemo {...props} /></Pinned>; // ours: pins
    });

  return orderedFields;
};

export default NodeContent;

export type Pins = { pinnable: string[]; pinned: string[]; toggle: (key: string) => void };

// ours: a field with its pin, for the group the node is in; without pins, the field alone
const Pinned = ({ fieldKey, pins, children }: { fieldKey: string; pins?: Pins; children: ReactNode }) => {
  if (!pins?.pinnable.includes(fieldKey)) return <>{children}</>;
  const on = pins.pinned.includes(fieldKey);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
      <IconButton size="small" className="nodrag" data-key="pin" title={on ? 'Unpin from the folded group' : 'Pin to the folded group'}
        onClick={() => pins.toggle(fieldKey)} sx={{ p: 0.25, color: on ? 'warning.main' : 'text.disabled' }}>
        {on ? <PushPinIcon sx={{ fontSize: '14px' }} /> : <PushPinOutlinedIcon sx={{ fontSize: '14px' }} />}
      </IconButton>
    </Box>
  );
};

const customFieldCache: Record<string, React.LazyExoticComponent<React.ComponentType<FieldProps>>> = {};

const getCustomField = (fieldName: string, module: string) => {
  const cacheKey = `${module}.${fieldName}`;

  if (!customFieldCache[cacheKey]) {
    customFieldCache[cacheKey] = lazy(() => import(`@custom-fields/${fieldName}.tsx`));
  }
  return customFieldCache[cacheKey];
};

const GroupMemo = memo((props: FieldProps) => {
  return <UIGroupField props={props}>{props.children}</UIGroupField>;
}, (prev, next) => {
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.hidden === next.hidden &&
    prev.children === next.children
  );
});

const FieldMemo = memo((props: FieldProps) => {
  if (props.display.startsWith('custom')) {
    const fieldName = props.display.split('.');
    const CustomField = getCustomField(fieldName[fieldName.length - 1], props.module);
    return (
      <Suspense fallback={<Box>Loading custom field...</Box>}>
        {CustomField ? <CustomField {...props} /> : <Box>Custom field not found</Box>}
      </Suspense>
    )
  }
  
  switch (props.fieldType) {
    case 'input':
    case 'output':
      return <HandleField {...props} />;
    case 'number':
    case 'slider':
      return <NumberField {...props} />;
    case 'filebrowser':
      return <FileBrowserField {...props} />;
    case 'select':
      return <SelectField {...props} />;
    case 'random':
      return <RandomField {...props} />;
    case 'checkbox':
    case 'switch':
      return <ToggleField {...props} />;
    case 'autocomplete':
      return <AutocompleteField {...props} />;
    case 'textarea':
      return <TextareaField {...props} />;
    case 'radio':
      return <RadioField {...props} />;
    case 'range':
      return <RangeField {...props} />;
    case 'spline':
      return <SplineField {...props} />;
    case 'modelselect':
      return <ModelSelectField {...props} />;
    case 'layerconfig':
      return <LayerConfigField {...props} />;
    case 'selectdialog':
      return <SelectDialogField {...props} />;
    case 'ui_text':
      return <UITextField {...props} />;
    case 'ui_image':
      return <UIImageField {...props} />;
    case 'ui_video':
      return <UIVideoField {...props} />;
    case 'ui_button':
      return <UIButtonField {...props} />;
    case 'ui_imagecompare':
      return <UIImagecompareField {...props} />;
    case 'ui_label':
      return <UILabelFieldField {...props} />;
    case 'ui_group':
      // this should never happen, handled in GroupMemo
      return null;
    case 'default':
    case 'string':
    default:
      return <InputField {...props} />;
  }
}, (prev, next) => {
  return (
    deepEqual(prev.value, next.value) &&
    prev.disabled === next.disabled &&
    prev.hidden === next.hidden &&
    prev.display === next.display &&
    prev.dataType === next.dataType &&
    prev.isConnected === next.isConnected &&
    deepEqual(prev.signal, next.signal)
  );
});

function getFieldType(display: string, dataType: string, options: any) {
  dataType = dataType.toLowerCase();

  if (display === 'input' || display === 'output') {
      return display;
  }

  if (dataType.startsWith('bool')) {
      return display === 'checkbox' || display === 'icontoggle' ? display : 'switch';
  }

  if (display.startsWith('ui_')) {
    return display;
  }

  if (dataType === 'text' || display.startsWith('text')) {
    return 'textarea';
  }

  if (display) {
      return display;
  }

  if (options && typeof options === 'object') {
      return 'select';
  }

  if (dataType.startsWith('int') || dataType === 'float' || dataType === 'number') {
      return display === 'slider' ? 'slider' : 'number';
  }

  return 'text';
}