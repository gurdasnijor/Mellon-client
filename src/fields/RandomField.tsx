import Box from "@mui/material/Box";
import { FieldProps } from "../components/NodeContent";
import Stack from "@mui/material/Stack";

import InputField from "./InputField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

export default function RandomField(props: FieldProps) {
    const fieldValue = typeof props.value === 'object' && 'value' in props.value
        ? props.value.value || 0
        : props.value || 0;
    const isRandom = typeof props.value === 'object' && 'isRandom' in props.value
        ? props.value.isRandom
        : false;
    
    const randomToggle = () => {
        props.updateStore(props.fieldKey, { value: fieldValue, isRandom: !isRandom });
    }

    const handleFieldChange = (key: string, value: any) => {
        props.updateStore(key, { value, isRandom });
    }

    return (
        <Box
            sx={{
                width: '100%',
                ...props.style,
            }}
            data-key={`${props.fieldKey}-random`}
            className={`${props.hidden ? 'mellon-hidden' : ''} mellon-field`}
        >
            <Stack
                direction="row"
                spacing={1}
                sx={{
                    width: '100%',
                    alignItems: 'center',
                }}
            >
                {/* ours: the wand's state reads in the field: on, Run rolls a new seed, so the node runs again */}
                <InputField
                    {...props}
                    label={isRandom ? `${props.label || 'Seed'} · new each run` : props.label}
                    value={fieldValue}
                    disabled={isRandom}
                    updateStore={handleFieldChange}
                />
                <Tooltip arrow title={isRandom
                    ? 'New seed each run: Run rolls one, so this node and what follows it run again. Click to keep this seed.'
                    : 'Click for a new seed each run.'}>
                    <IconButton
                        size="small"
                        className='nodrag'
                        aria-label="New seed each run"
                        aria-pressed={isRandom}
                        sx={{
                            color: isRandom ? 'primary.main' : 'text.secondary',
                            opacity: isRandom ? 1 : 0.5,
                            width: 24,
                            height: 24,
                        }}
                        onClick={randomToggle}
                    >
                        <AutoFixHighIcon />
                    </IconButton>
                </Tooltip>
            </Stack>
        </Box>
    );
}