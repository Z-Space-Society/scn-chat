import { createFormHook, createFormHookContexts } from '@tanstack/react-form'
import { type ComponentProps, type ReactNode, useId } from 'react'

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts()

type Controlled<Element extends 'input' | 'textarea' | 'select'> = Omit<
  ComponentProps<Element>,
  'name' | 'value' | 'checked' | 'onChange' | 'onBlur'
>

interface LabelProps {
  /** Text for a label wrapping the control. Leave it out and pass `aria-label` instead. */
  label?: ReactNode
}

interface TextFieldProps extends Controlled<'input'>, LabelProps {}

/** A text input bound to its field. */
function TextField(props: TextFieldProps) {
  const field = useFieldContext<string>()
  const { label, ...input } = props
  const generatedId = useId()
  const id = input.id ?? generatedId
  const control = (
    <input
      {...input}
      id={id}
      name={field.name}
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
    />
  )
  if (label === undefined) return control
  return (
    <label htmlFor={id}>
      {label}
      {control}
    </label>
  )
}

interface TextAreaFieldProps extends Controlled<'textarea'>, LabelProps {}

/** A textarea bound to its field. */
function TextAreaField(props: TextAreaFieldProps) {
  const field = useFieldContext<string>()
  const { label, ...textarea } = props
  const generatedId = useId()
  const id = textarea.id ?? generatedId
  const control = (
    <textarea
      {...textarea}
      id={id}
      name={field.name}
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
    />
  )
  if (label === undefined) return control
  return (
    <label htmlFor={id}>
      {label}
      {control}
    </label>
  )
}

interface CheckboxFieldProps extends Omit<Controlled<'input'>, 'type'> {
  /** Text after the checkbox, inside its label. */
  label: ReactNode
}

/** A labelled checkbox bound to a boolean field. */
function CheckboxField(props: CheckboxFieldProps) {
  const field = useFieldContext<boolean>()
  const { label, ...input } = props
  return (
    <label>
      <input
        {...input}
        type="checkbox"
        name={field.name}
        checked={field.state.value}
        onChange={(e) => field.handleChange(e.target.checked)}
        onBlur={field.handleBlur}
      />{' '}
      {label}
    </label>
  )
}

interface SelectFieldProps extends Controlled<'select'>, LabelProps {
  /** The options. */
  children: ReactNode
}

/** A select bound to a string field. */
function SelectField(props: SelectFieldProps) {
  const field = useFieldContext<string>()
  const { label, children, ...select } = props
  const generatedId = useId()
  const id = select.id ?? generatedId
  const control = (
    <select
      {...select}
      id={id}
      name={field.name}
      value={field.state.value}
      onChange={(e) => field.handleChange(e.target.value)}
      onBlur={field.handleBlur}
    >
      {children}
    </select>
  )
  if (label === undefined) return control
  return (
    <label htmlFor={id}>
      {label}
      {control}
    </label>
  )
}

/** A form that submits through its form API rather than the browser. */
function Form(props: Omit<ComponentProps<'form'>, 'onSubmit'>) {
  const form = useFormContext()
  return (
    <form
      {...props}
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    />
  )
}

interface SubmitButtonProps {
  children: ReactNode
}

/** The form's submit button, disabled while the form submits. */
function SubmitButton(props: SubmitButtonProps) {
  const form = useFormContext()
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <button type="submit" disabled={isSubmitting}>
          {props.children}
        </button>
      )}
    </form.Subscribe>
  )
}

/**
 * The app's forms. `useAppForm` is TanStack Form's `useForm` with these controls attached: a field
 * renders `<form.AppField name="x">{(field) => <field.TextField />}</form.AppField>`, and the form
 * itself `<form.AppForm><form.Form>…<form.SubmitButton>Save</form.SubmitButton></form.Form></form.AppForm>`.
 * A part of a form split into its own component takes the form as a prop, typed from a hook that
 * makes the form. TanStack Form's `withForm` would do, but React Compiler skips its render
 * functions without saying so.
 */
export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { TextField, TextAreaField, CheckboxField, SelectField },
  formComponents: { Form, SubmitButton },
})

export { useFieldContext }
