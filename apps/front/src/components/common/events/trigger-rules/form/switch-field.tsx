import { Field, FieldDescription, FieldLabel } from "@pes/ui/components/field";
import { Switch } from "@pes/ui/components/switch";

type SwitchFieldProps = {
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
};

/**
 * Toggle field matching the layout of the other form fields:
 * the label sits above the control and the switch lines up with adjacent inputs.
 */
export function SwitchField({ label, description, checked, onCheckedChange, disabled, className }: SwitchFieldProps) {
    return (
        <Field className={className}>
            <FieldLabel>{label}</FieldLabel>
            <div className="flex min-h-9 items-center">
                <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
            </div>
            <FieldDescription>{description}</FieldDescription>
        </Field>
    );
}
