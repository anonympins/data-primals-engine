import React, {
    forwardRef, useCallback,
    useEffect,
    useMemo,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import uniqid from "uniqid";
import cn from "classnames";
import { recursiveMap, useRefs } from "./Utils.jsx";
import {useTranslation} from "react-i18next";
import { CodeiumEditor } from "@codeium/react-code-editor";

import {debounce, escapeRegExp, isGUID, isLightColor} from "../../src/core.js";
import {mainFieldsTypes, maxFileSize} from "../../src/constants.js";
import {useModelContext} from "./contexts/ModelContext.jsx";
import { SketchPicker } from 'react-color'; // Importer le sélecteur
import {useQueryClient} from "react-query";
import tinycolor from 'tinycolor2';
import { 
    FaArrowDown,
    FaArrowUp, FaAt, FaCheckCircle, FaEye, FaEyeSlash, FaExclamationCircle,
    FaCalendar, FaCalendarWeek, FaCode, FaFile,
    FaHashtag, FaIcons,
    FaImage, FaSpinner,
    FaLink, FaListOl, FaListUl,
    FaLock, FaMinus,
    FaPallet, FaPhone, FaSitemap,
    FaToggleOn
} from "react-icons/fa";
 import * as Fa6Icons from 'react-icons/fa6'; // Importer Fa6
import {FaCalendarDays, FaCodeCompare, FaPencil, FaT, FaTableColumns} from "react-icons/fa6";
import SyntaxHighlighter from 'react-syntax-highlighter';

import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {useRealtimeValidation} from "./hooks/useValidation.js";
import Switch from "react-switch";
export const Form = ({
  name,
  onValidate,
  onError,
  children,
  editable,
  className = "",
}) => {
  const [childrenRef, registerRef] = useRefs();
  const onSubmit = (e) => {
    e.preventDefault();
    let res = true;
    Object.keys(childrenRef.current).forEach((item) => {
      res = childrenRef.current[item].validate() && res;
    });
    if (res) {
      if (onValidate) onValidate(e);
    } else {
      if (onError) onError();
    }
  };

  /**/
  return (
    <form
      name={name}
      noValidate={true}
      contentEditable={editable}
      className={cn({ ["form-" + name]: true }) + " " + (className || "")}
      onSubmit={onSubmit}
    >
      {recursiveMap(children, (child, index) => {
        /*if( child?.type?.displayName?.match(/(Field|RadioGroup)/)){
                        return <child.type {...child.props} ref={registerRef(child?.type?.displayName.concat('-').concat(child.props.name || uniqid()))} />
                    }*/
        return child;
      })}
    </form>
  );
};

const TextField = forwardRef(function TextField(
    {
        name,
        label,
        placeholder,
        help,
        editable,
        value,
        required,
        readOnly,
        onChange,
        multiline,
        minlength,
        maxlength,
        searchable,
        labelProps,
        showErrors = false,
        before,
        after,
        validation,
        showTooltipErrors = false,
        mask,
        replacement,
        ...rest
    },
    ref,
) {
    const [id, setId] = useState("textfield-" + uniqid());
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [errors, setErrors] = useState([]);
    const inputRef = useRef();

    const parsedReplacement = useMemo(() => {
        if (!replacement || typeof replacement !== 'object') return null;
        const newRep = {};
        try {
            for (const key in replacement) {
                // La valeur du modèle est une chaîne (ex: "\\d"), on crée un RegExp
                newRep[key] = new RegExp(replacement[key]);
            }
            return newRep;
        } catch (e) {
            console.error("Invalid regex pattern in mask replacement:", e);
            return null; // Configuration de remplacement invalide
        }
    }, [replacement]);

    // --- Real-time validation logic ---
    const {
        validate: realtimeValidate,
        validationState
    } = useRealtimeValidation(
        validation?.modelName,
        validation?.docId
    );
    const isRealtimeValidationEnabled = !!validation?.modelName;
    const fieldValidationState = validationState[name] || { status: 'idle' };

    const { type, ...otherRest } = rest;
    const isPasswordField = type === 'password';

    const mult = typeof multiline !== 'undefined' ? multiline : maxlength > 255;

    const validate = () => {
        const errs = [];
        if (required && (!value || String(value).trim() === "")) {
            errs.push("Field required");
        }
        if (
            minlength > 0 &&
            typeof value == "string" &&
            value.trim().length < minlength
        ) {
            errs.push("Value length must be >= to " + minlength);
        }
        if (
            maxlength !== undefined && maxlength > 0 &&
            typeof value == "string" &&
            value.trim().length > maxlength
        ) {
            errs.push("Value length must be <= to " + maxlength);
        }
        if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid') {
            errs.push(fieldValidationState.error);
        }

        if (showErrors) {
            setErrors(errs);
        }
        return !errs.length && fieldValidationState.status !== 'invalid';
    };

    useImperativeHandle(ref, () => ({
        ref: inputRef.current,
        validate,
        getValue: () => value,
    }));

    const handleMaskedChange = (e) => {
        const inputValue = e.target.value;
        let newValue = '';
        let rawIndex = 0;

        // Appliquer le masque
        for (let i = 0; i < mask.length; i++) {
            const maskChar = mask[i];

            // Si nous avons dépassé la longueur de la valeur d'entrée, sortir de la boucle
            if (rawIndex >= inputValue.length) break;

            // Si le caractère du masque est un placeholder (défini dans replacement)
            if (parsedReplacement && parsedReplacement[maskChar]) {
                const pattern = parsedReplacement[maskChar];
                const inputChar = inputValue[rawIndex];

                // Vérifier si le caractère correspond au motif
                if (pattern.test(inputChar)) {
                    newValue += inputChar;
                    rawIndex++;
                } else {
                    // Ignorer les caractères qui ne correspondent pas au motif
                    rawIndex++;
                    i--; // Réessayer avec le même caractère de masque
                }
            } else {
                // Si c'est un caractère littéral du masque, l'ajouter
                newValue += maskChar;

                // Si le caractère d'entrée correspond au caractère littéral, avancer
                if (inputValue[rawIndex] === maskChar) {
                    rawIndex++;
                }
            }
        }

        // Appeler le onChange parent avec la nouvelle valeur masquée
        const syntheticEvent = {
            ...e,
            target: {
                ...e.target,
                value: newValue
            }
        };

        if (onChange) {
            onChange(syntheticEvent);
        }
    };

    const handleChange = (e) => {
        if (mask && parsedReplacement) {
            handleMaskedChange(e);
        } else if (onChange) {
            onChange(e);
        }

        if (isRealtimeValidationEnabled) {
            realtimeValidate(name, e.target.value);
        }
    };

    const togglePasswordVisibility = () => {
        setIsPasswordVisible(prevState => !prevState);
    };

    useEffect(() => {
        if (value !== null && !isRealtimeValidationEnabled) validate();
    }, [value]);

    const combinedErrors = [...errors];
    if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid' && fieldValidationState.error && !combinedErrors.includes(fieldValidationState.error)) {
        combinedErrors.push(fieldValidationState.error);
    }
    const hasErrors = combinedErrors.length > 0;
    // Sanitize errors for HTML attribute to prevent XSS
    const errorsHtml = hasErrors ? `<ul>${combinedErrors.map(e => `<li>${String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>` : '';

    const renderValidationIcon = () => {
        if (!isRealtimeValidationEnabled) return null;
        const { status, error } = fieldValidationState;
        switch (status) {
            case 'validating': return <FaSpinner className="spin-icon validation-icon validating" title="Validating..." />;
            case 'valid': return <FaCheckCircle className="validation-icon valid" title="Valid" />;
            case 'invalid': return <FaExclamationCircle className="validation-icon invalid" title={error} />;
            default: return null;
        }
    };

    return (
        <>
            <div
                className={cn({
                    field: true,
                    flex: true,
                    "field-text": !mult,
                    "field-multiline": mult,
                    'is-validating': fieldValidationState.status === 'validating',
                    'is-valid': fieldValidationState.status === 'valid',
                    'is-invalid': hasErrors && fieldValidationState.status === 'invalid',
                })}
                {...(showTooltipErrors && hasErrors && {
                    'data-tooltip-id': "tooltipField",
                    'data-tooltip-html': errorsHtml
                })}
            >
                {label && (
                    <label
                        contentEditable={editable}
                        className={cn({ help: !!help, 'flex-1': true })}
                        htmlFor={id}
                        {...labelProps}
                    >
                        {label}
                        {required ? (
                            <span className="mandatory" contentEditable={false}>
                *
              </span>
                        ) : (
                            ""
                        )}
                    </label>
                )}

                {help && <div className="flex help">{help}</div>}

                {mult && (
                    <textarea
                        ref={inputRef}
                        aria-required={required}
                        aria-readonly={readOnly}
                        readOnly={readOnly}
                        placeholder={placeholder}
                        id={id}
                        name={name}
                        value={value || ""}
                        rows={8}
                        onChange={handleChange}
                        minLength={minlength}
                        maxLength={maxlength}
                        {...rest}
                    ></textarea>
                )}

                {before}
                <div className={"flex flex-1 flex-no-gap flex-start"} style={{ position: 'relative' }}>
                    {!mult && (
                        <input
                            ref={inputRef}
                            aria-required={required}
                            aria-readonly={readOnly}
                            readOnly={readOnly}
                            type={isPasswordField ? (isPasswordVisible ? 'text' : 'password') : (searchable ? "search" : (type || "text"))}
                            placeholder={placeholder}
                            title={placeholder}
                            alt={placeholder}
                            id={id}
                            name={name}
                            value={value || ""}
                            onChange={handleChange}
                            minLength={minlength}
                            maxLength={maxlength}
                            required={required}
                            {...otherRest}
                        />
                    )}
                    <div className="field-icons-wrapper" style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {renderValidationIcon()}
                        {isPasswordField && !mult && (
                            <button type="button" onClick={togglePasswordVisibility} className="password-toggle-icon">
                                {isPasswordVisible ? <FaEyeSlash /> : <FaEye />}
                            </button>
                        )}
                    </div>
                    {after}
                </div>
            </div>
            {!showTooltipErrors && hasErrors && (
                <ul className="error">
                    {combinedErrors.map((e, key) => (
                        <li key={key} aria-live="assertive" role="alert">
                            {e}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
});

TextField.displayName = "TextField";
export { TextField };

const EmailField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      value, // Changed from defaultValue to be a controlled component
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      validation,
      showErrors = true,
      showTooltipErrors = false,
    },
    ref,
  ) => {
    const id = "emailfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const inputRef = useRef();

    // --- Real-time validation logic ---
    const {
        validate: realtimeValidate,
        validationState
    } = useRealtimeValidation(
        validation?.modelName,
        validation?.docId
    );
    const isRealtimeValidationEnabled = !!validation?.modelName;
    const fieldValidationState = validationState[name] || { status: 'idle' };

    const validate = () => {
      const errs = [];
      if (required && (!value || String(value).trim() === "")) {
        errs.push("Field required");
      }
      if (minlength !== undefined && minlength > 0 && value && String(value).trim().length < minlength) {
        errs.push("Value length must be >= to " + minlength);
      }
      if (maxlength !== undefined && maxlength > 0 && value && String(value).trim().length > maxlength) {
        errs.push("Value length must be <= to " + maxlength);
      }
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errs.push("Invalid email");
      }
      if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid') {
          errs.push(fieldValidationState.error);
      }
      if (showErrors) setErrors(errs);
      return !errs.length && fieldValidationState.status !== 'invalid';
    };

    useEffect(() => {
      if (value !== null && !isRealtimeValidationEnabled) validate();
    }, [value]);

    const combinedErrors = [...errors];
    if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid' && fieldValidationState.error && !combinedErrors.includes(fieldValidationState.error)) {
        combinedErrors.push(fieldValidationState.error);
    }
    const hasErrors = combinedErrors.length > 0;
    const errorsHtml = hasErrors ? `<ul>${combinedErrors.map(e => `<li>${String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>` : '';

    useImperativeHandle(ref, () => ({
      ref: inputRef.current,
      validate,
      getValue: () => value,
    }));

    const handleChange = (e) => {
      if (onChange) {
        onChange(e);
      }
      if (isRealtimeValidationEnabled) {
          realtimeValidate(name, e.target.value);
      }
    };

    const renderValidationIcon = () => {
        if (!isRealtimeValidationEnabled) return null;
        const { status, error } = fieldValidationState;
        switch (status) {
            case 'validating': return <FaSpinner className="spin-icon validation-icon validating" title="Validating..." />;
            case 'valid': return <FaCheckCircle className="validation-icon valid" title="Valid" />;
            case 'invalid': return <FaExclamationCircle className="validation-icon invalid" title={error} />;
            default: return null;
        }
    };

    return (
      <>
        <div className={cn({ field: true, "flex": true, "field-email": true,
            'is-validating': fieldValidationState.status === 'validating',
            'is-valid': fieldValidationState.status === 'valid',
            'is-invalid': hasErrors && fieldValidationState.status === 'invalid',
        })}
             {...(showTooltipErrors && hasErrors && {
                 'data-tooltip-id': "tooltipField",
                 'data-tooltip-html': errorsHtml
             })}
        >
          <label
            contentEditable={editable}
            className={cn({ help: !!help })}
            title={help}
            htmlFor={id}
          >
            {label}
            {required ? (
              <span className="mandatory" contentEditable={false}>
                *
              </span>
            ) : (
              ""
            )}
          </label>
            <div className={"flex flex-1 flex-no-gap flex-start"} style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                aria-required={required}
                aria-readonly={readOnly}
                readOnly={readOnly}
                type="email"
                placeholder={placeholder}
                id={id}
                name={name}
                value={value || ""}
                onChange={handleChange}
                minLength={minlength}
                maxLength={maxlength}
              />
                <div className="field-icons-wrapper" style={{position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                    {renderValidationIcon()}
                </div>
            </div>
        </div>
        {!showTooltipErrors && hasErrors && (
          <ul className="error">
              {combinedErrors.map((e, key) => (
                  <li key={key} aria-live="assertive" role="alert">
                      {e}
                  </li>
              ))}
          </ul>
        )}
      </>
    );
  },
);
EmailField.displayName = "EmailField";
export { EmailField };

const NumberField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      value,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      min,
      max,
      step,
        unit,
        validation,
        showErrors = true,
        showTooltipErrors = false,
        ...rest
    },
    ref,
  ) => {
    const id = "numberfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const inputRef = useRef();

      const {
          validate: realtimeValidate,
          validationState
      } = useRealtimeValidation(validation?.modelName, validation?.docId);
      const isRealtimeValidationEnabled = !!validation?.modelName;
      const fieldValidationState = validationState[name] || { status: 'idle' };

    const validate = () => {
      const errs = [];
      if (required && value === undefined) {
        errs.push("Field required");
      }
      if (minlength !== undefined && minlength > 0 && value && value.trim().length < minlength) {
        errs.push("Value length must be >= to " + minlength);
      }
      if (maxlength !== undefined && maxlength > 0 && value && value.trim().length > maxlength) {
        errs.push("Value length must be <= to " + maxlength);
      }
      if ((min || min === 0) && (value || value === 0) && min > value) {
        errs.push("Value < to " + min);
      }
      if ((max || max === 0) && (value || value === 0) && max < value) {
        errs.push("Value > to " + max);
      }
        if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid') {
            errs.push(fieldValidationState.error);
        }
      if(showErrors) setErrors(errs);
      return !errs.length && fieldValidationState.status !== 'invalid';
    };

    useEffect(() => {
      if (value !== null && !isRealtimeValidationEnabled) validate();
    }, [value]);

    const combinedErrors = [...errors];
    if (isRealtimeValidationEnabled && fieldValidationState.status === 'invalid' && fieldValidationState.error && !combinedErrors.includes(fieldValidationState.error)) {
        combinedErrors.push(fieldValidationState.error);
    }
    const hasErrors = combinedErrors.length > 0;
    const errorsHtml = hasErrors ? `<ul>${combinedErrors.map(e => `<li>${String(e).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>` : '';

    useImperativeHandle(ref, () => ({
      ref: inputRef.current,
      validate,
      getValue: () => value,
    }));

    const handleChange = (e) => {
      if (onChange) {
        onChange(e);
      }
        if (isRealtimeValidationEnabled) {
            realtimeValidate(name, e.target.value);
        }
    };

      const renderValidationIcon = () => {
          if (!isRealtimeValidationEnabled) return null;
          const { status, error } = fieldValidationState;
          switch (status) {
              case 'validating': return <FaSpinner className="spin-icon validation-icon validating" title="Validating..." />;
              case 'valid': return <FaCheckCircle className="validation-icon valid" title="Valid" />;
              case 'invalid': return <FaExclamationCircle className="validation-icon invalid" title={error} />;
              default: return null;
          }
      };

    return (
      <>
        <div className={cn({ field: true, "field-number": true,
            'is-validating': fieldValidationState.status === 'validating',
            'is-valid': fieldValidationState.status === 'valid',
            'is-invalid': hasErrors && fieldValidationState.status === 'invalid',
        })}
             {...(showTooltipErrors && hasErrors && {
                 'data-tooltip-id': "tooltipField",
                 'data-tooltip-html': errorsHtml
             })}
        >

            <div className="flex flex-1">
                {label && (
                    <label
                        contentEditable={editable}
                        className={cn({ help: !!help, flex: true, 'flex-1': true })}
                        title={help}
                        htmlFor={id}
                    >
                        {label}
                        {required ? (
                            <span className="mandatory" contentEditable={false}>
                  *
                </span>
                        ) : (
                            ""
                        )}
                    </label>
                )}
                {help && <div className="flex help">{help}</div>}
                <div className={"flex flex-1 flex-no-wrap flex-mini-gap flex-end"} style={{ position: 'relative' }}>
                  <input
                    ref={inputRef}
                    aria-required={required}
                    aria-readonly={readOnly}
                    readOnly={readOnly}
                    type="number"
                    placeholder={placeholder}
                    id={id}
                    name={name}
                    value={value ?? ""}
                    onChange={handleChange}
                    minLength={minlength}
                    maxLength={maxlength}
                    min={min}
                    max={max}
                    step={step}
                    {...rest}
                  />
                    <div className="field-icons-wrapper" style={{position: 'absolute', right: unit ? '40px' : '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '5px'}}>
                        {renderValidationIcon()}
                    </div>
                    {unit && <span className="unit">{unit}</span>}
                </div>
        </div>
        </div>
        {!showTooltipErrors && hasErrors && (
          <ul className="error">
              {combinedErrors.map((e, key) => (
                  <li key={key} aria-live="assertive" role="alert">
                      {e}
                  </li>
              ))}
          </ul>
        )}
      </>
    );
  },
);
NumberField.displayName = "NumberField";
export { NumberField };

const CheckboxField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      defaultValue,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      checked,
        checkbox=false,
        ...rest
    },
    ref,
  ) => {
    const id = "checkfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [value, setValue] = useState(checked || false);
    useEffect(() => {
      setValue(checked);
    }, [checked]);
    const validate = () => {
      const errs = [];
      if (required && !value) {
        errs.push("Field must be checked.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      setValue(!value);
      onChange?.(e);
    };
    return (
        <>
            <div className={cn({field: true, "field-checkbox": true,"field-bg": true})}>
                {label && (
                    <label
                        contentEditable={editable}
                        title={help}
                        htmlFor={id}
                    >
                        {label}
                        {required ? (
                            <span className="mandatory" contentEditable={false}>
                  *
                </span>
                        ) : (
                            ""
                        )}
                    </label>
                )}
                {help && <div className="flex help">{help}</div>}
                {!checkbox && (<Switch
                    id={id}
                    onChange={handleChange}
                    checked={value} />)}
                {checkbox && (
                    <input type={"checkbox"} id={id} onChange={handleChange} checked={value} />
                )}
            </div>
            {errors.length > 0 && (
                <ul className="error">
                    {errors.map((e, key) => (
                        <li key={key} aria-live="assertive" role="alert">
                            {JSON.stringify(e, null, 2)}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
  },
);
CheckboxField.displayName = "CheckboxField";
export { CheckboxField };

const RadioField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      checked,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
    },
    ref,
  ) => {
    const id = "radiofield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [value, setValue] = useState(checked || null);
    const validate = () => {
      const errs = [];
      if (required && !value) {
        errs.push("Field must be checked.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      setValue(!value);
      if (onChange) {
        onChange(e);
      }
    };
    return (
      <>
        <div className={cn({ field: true, "field-radio": true })}>
          <input
            aria-required={required}
            aria-readonly={readOnly}
            readOnly={readOnly}
            type="radio"
            checked={value}
            value={value || label}
            placeholder={placeholder}
            id={id}
            name={name}
            onChange={handleChange}
            minLength={minlength}
            maxLength={maxlength}
          />
          <label
            contentEditable={editable}
            className={cn({ help: !!help })}
            title={help}
            htmlFor={id}
          >
            {label}
            {required ? (
              <span className="mandatory" contentEditable={false}>
                *
              </span>
            ) : (
              ""
            )}
          </label>
        </div>
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
RadioField.displayName = "RadioField";
export { RadioField };

const SelectField = forwardRef(
  (
    {
      name,
      value,
      items,
      label,
      placeholder,
        disabled,
      help,
      editable,
      checked,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      multiple,
        ...rest
    },
    ref,
  ) => {
      const [values, setValues] = useState([]);
    const id = "selectfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [_value, setValue] = useState(value);
    useEffect(() => {
        if( value === undefined && required && items[0]){
            setValue(items[0].value);
        }else {
            setValue(value);
            setValues(value)
        }
      if (!multiple && value) {
          //const index = items.findIndex((i) => i.value === value);
          //onChange({name, value:items[index]}, index);
      }
    }, [value]);
    const validate = () => {
      const errs = [];
      if (required && _value === undefined) {
        errs.push("Field is required.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (_value !== null) validate();
    }, [_value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => _value,
      setValue,
    }));
    const handleChange = (e) => {
      setValue(e.target.value);
      if (onChange) {
            let options = e.target.options;
            let value = [];
            for (var i = 0, l = options.length; i < l; i++) {
              if (options[i].selected) {
                  value.push(options[i].value);
              }
            }
            if( multiple ) {
                setValues(value);
                onChange(value);
            }else {
                const index = items.findIndex((i) => i.value+'' === e.target.value);
                onChange(items[index], index);
            }
      }
    };
    return (
      <>
        <div className={cn({ field: true, 'flex-1': true, flex: true, "field-select": true })}>
          {label && (
            <label
              contentEditable={editable}
              className={cn({ help: !!help, 'flex-1': true })}
              title={help}
              htmlFor={id}
            >
              {label}
              {required ? (
                <span className="mandatory" contentEditable={false}>
                  *
                </span>
              ) : (
                ""
              )}
            </label>
          )}
          <select
            aria-required={required}
            aria-readonly={readOnly}
            value={(_value)}
            id={id}
            name={name}
            onChange={handleChange}
            multiple={multiple}
            disabled={disabled}
            className={"flex-1"}
            {...rest}
          >
            {items.map((i) => (
              <option value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        {help && <div className="flex help">{help}</div>}
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
SelectField.displayName = "SelectField";
export { SelectField };

const RadioGroup = forwardRef(
  ({ id, label, help, editable, name, required, children }, ref) => {
    const [childrenRef, registerRef] = useRefs();
    const [errors, setErrors] = useState([]);
    const validate = () => {
      const errs = [];
      let res = false;
      Object.keys(childrenRef.current).forEach((item) => {
        res = !!childrenRef.current[item].getValue() || res;
      });
      if (!res && required) {
        errs.push("Field is required");
      }
      setErrors(errs);
      return !errs.length;
    };
    useImperativeHandle(ref, () => ({
      validate,
    }));
    const handleChange = () => {
      setTimeout(() => validate(), 0);
    };
    return (
      <>
        <label
          contentEditable={editable}
          className={cn({ help: !!help })}
          title={help}
          htmlFor={children[0].props.id}
        >
          {label}
          {required ? (
            <span className="mandatory" contentEditable={false}>
              *
            </span>
          ) : (
            ""
          )}
        </label>
        {[
          recursiveMap(children, (child, index) => {
            if (child.type.displayName === "RadioField") {
              const props = {
                ...child.props,
                name: name ? name : child.props.name,
                onChange: () => handleChange(child.props.onChange),
              };
              return (
                <child.type
                  {...props}
                  ref={registerRef("Radio" + index)}
                  name={child.props.name || "btn" + id}
                />
              );
            }
            return child;
          }),
          errors.length > 0 ? (
            <ul className="error">
              {errors.map((e, key) => (
                <li key={key} aria-live="assertive" role="alert">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <></>
          ),
        ]}
      </>
    );
  },
);

RadioGroup.displayName = "RadioGroup";
export { RadioGroup };

// New FileField component
const FileField = ({ inputProps, value, onChange, name, mimeTypes, maxSize, multiple}) => {
    const [fileInfos, setFileInfos] = useState(value);
    const { t } = useTranslation();

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        const newFileInfos = [];

        const promises = selectedFiles.map(selectedFile => {
            if (selectedFile && selectedFile.size > (maxSize || maxFileSize)) {
                alert(`Le fichier est trop volumineux. La taille maximale autorisée est de ${(maxSize || maxFileSize) / (1024 * 1024)} Mo.`);
                e.target.value = '';
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    newFileInfos.push({
                        preview: reader.result,
                        newFile: true,
                        file: selectedFile,
                        name: selectedFile.name
                    });
                    resolve();
                };
                reader.readAsDataURL(selectedFile);
            });
        });

        Promise.all(promises).then(() => {
            if(!multiple){
                setFileInfos(newFileInfos);
            }else{
                setFileInfos(fileInfos => [...fileInfos, ...newFileInfos]);
            }
            onChange([...fileInfos.map(m => ({...m, newFile: false})), ...newFileInfos]);
        });
    };

    const handleRemove = (e, index) => {
        e.preventDefault();
        const newFileInfos = fileInfos.filter((_, i) => i !== index);
        setFileInfos(newFileInfos);
        onChange(newFileInfos.map(m => ({...m, newFile: false})));
    };

    useEffect(() => {
        if( value == null || (Array.isArray(value) && value.length === 0))
            setFileInfos([])
        else{
            const v = Array.isArray(value) ? value : [value];
            setFileInfos(v)
        }
    }, [value]);

    return (
        <div className="field field-file">
            <input
                id={"field-file-" + name}
                type="file"
                data-field={name}
                accept={mimeTypes ? mimeTypes.join(',') : '*'}
                onChange={handleFileChange}
                multiple={multiple} // Add multiple attribute
            />
            {fileInfos?.length > 0 && (
                <div>
                    {fileInfos.filter(f => isGUID(f.guid) || f.preview).map((fileInfo, index) => (
                        <div key={index}>
                            {fileInfo.preview ? (
                                <a href={fileInfo.preview} target="_blank" rel="noopener noreferrer">
                                    <img src={fileInfo.preview} alt={"Preview"} width='200' height='200' />
                                </a>
                            ) :(isGUID(fileInfo.guid) ? (
                                    <a href={"/resources/"+fileInfo.guid} target="_blank" rel="noopener noreferrer">
                                        <img src={"/resources/"+fileInfo.guid} alt={"Preview"} width='200' height='200' />
                                    </a>
                                ) :(
                                <img src={fileInfo.preview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                            ))}
                            <button onClick={(e) => handleRemove(e, index)}><FaMinus /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export { FileField };

export const FilterNumberField = ({ model, field, onChangeFilterValue, filterValues, setFilterValues }) => {
    const { t } = useTranslation();
    const { models, setPage, dataByModel } = useModelContext(); // dataByModel is not used, consider removing
    const [min, setMin] = useState(null);
    const [max, setMax] = useState(null);

    // Debounced version of the function that actually calls onChangeFilterValue
    const debouncedApplyFilter = useCallback(
        debounce((currentMin, currentMax) => {
            const conditions = [];
            setPage(1);
            if (currentMin !== null && !isNaN(currentMin)) {
                conditions.push({ $gte: ['$' + field.name, parseFloat(currentMin)] });
            }
            if (currentMax !== null && !isNaN(currentMax)) {
                conditions.push({ $lte: ['$' + field.name, parseFloat(currentMax)] });
            }

            if (conditions.length > 0) {
                onChangeFilterValue(field, { $and: conditions });
            } else {
                onChangeFilterValue(field, {}); // Clear filter if both are invalid/null
            }
        }, 300), // Adjust delay as needed
        [field, onChangeFilterValue] // Dependencies for useCallback
    );

    useEffect(() => {
        // This effect is to reset local min/max if the global filterValues are cleared externally
        // It should not call debouncedApplyFilter directly if filterValues is the source of truth
        // for the parent component.
        if (filterValues && typeof filterValues[field.name] === 'object') {
            const andConditions = filterValues[field.name]?.$and;
            if (andConditions && Array.isArray(andConditions)) {
                const gteCondition = andConditions.find(cond => cond.$gte);
                const lteCondition = andConditions.find(cond => cond.$lte);
                setMin(gteCondition ? gteCondition.$gte[1] : null);
                setMax(lteCondition ? lteCondition.$lte[1] : null);
            } else {
                // If the structure is not $and or it's cleared
                setMin(null);
                setMax(null);
            }
        } else if (!filterValues || filterValues[field.name] === undefined || Object.keys(filterValues[field.name] || {}).length === 0) {
            // If filterValues for this field is cleared or doesn't exist
            setMin(null);
            setMax(null);
        }
    }, [filterValues, field.name]);


    const handleMinChange = (e) => {
        const inputValue = e.target.value;
        if (inputValue === "") {
            setMin(null);
            debouncedApplyFilter(null, max);
        } else {
            const pi = parseFloat(inputValue); // Use parseFloat for potentially decimal numbers
            if (!isNaN(pi)) {
                setMin(pi);
                debouncedApplyFilter(pi, max);
            } else {
                setMin(inputValue); // Keep invalid input in state to show user, but don't filter
                // Or setMin(null) if you want to clear on invalid
                // Potentially call debouncedApplyFilter(null, max) if invalid min means no min filter
            }
        }
        gtag('event', 'search (number,min)');
    };

    const handleMaxChange = (e) => {
        const inputValue = e.target.value;
        if (inputValue === "") {
            setMax(null);
            debouncedApplyFilter(min, null);
        } else {
            const pi = parseFloat(inputValue);
            if (!isNaN(pi)) {
                setMax(pi);
                debouncedApplyFilter(min, pi);
            } else {
                setMax(inputValue);
                // Potentially call debouncedApplyFilter(min, null) if invalid max means no max filter
            }
        }
        gtag('event', 'search (number,max)');
    };

    return (
        <>
            <NumberField
                value={min === null ? '' : min} // Handle null for empty display
                label="Min:"
                onChange={handleMinChange}
                type="number" // Ensure type is number for appropriate input behavior
            />
            <NumberField
                value={max === null ? '' : max} // Handle null for empty display
                label="Max:"
                onChange={handleMaxChange}
                type="number" // Ensure type is number
            />
        </>
    );
};

export const FilterEnumField = ({model, field, onChangeFilterValue, filterValues, setFilterValues}) => {
    const {t} = useTranslation();
    const debounced = debounce((field,filter) => onChangeFilterValue(field, { $find: filter }));
    const { models, setPage, elementsPerPage,pagedFilters, pagedSort, page       } = useModelContext();

    const [val, setVal] = useState(null);
    const queryClient= useQueryClient()

    useEffect(() => {
        if (Object.keys(filterValues).length === 0){
            onChangeFilterValue(field, { });
            setVal('');
        }
    }, [filterValues]);

    return <div className={"flex flex-no-gap flex-no-wrap"}><SelectField value={val} className={"flex-1"} items={['', ...(field.items || [])].map(m => ({label: t(m), value: m}))} onChange={(e) => {

        setPage(1);

        if( !e || e.value === '') {
            setVal('');
            onChangeFilterValue(field, undefined);
        }
        else {
            onChangeFilterValue(field, {$eq: ['$' + field.name, e.value]});
            setVal(e.value);
        }

        gtag('event', 'search (enum)');
        queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
    }} /><button onClick={() => {
        onChangeFilterValue(field, { });
        setVal('');
    }}>x</button></div>
}
export const FilterBooleanField = ({model, field, filterValues, onChangeFilterValue  }) => {
    const {t} = useTranslation();
    const { setPage, pagedFilters, pagedSort, page,elementsPerPage } = useModelContext();

    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            setVal('null');
            onChangeFilterValue(field, { });
        }
    }, [filterValues]);
    const [val, setVal] = useState(null);
    const queryClient= useQueryClient()
    return <div className={"flex flex-no-gap flex-no-wrap"}><SelectField value={val} className={"flex-1"} items={[
        {label: t(''), value: 'null'},
        {label: t('yes'), value: '1'},
        { label: t('no'), value: '0'}]}
         onChange={(e) => {
             setPage(1);
             if( !e || e.value === 'null') {
                 setVal(null);
                 onChangeFilterValue(field, { });
             }
             else {
                 onChangeFilterValue(field, {$or: [{$eq: ['$' + field.name, e.value === '1']}, {$eq: [{ $type: '$'+field.name }, "missing"]}]});
                 setVal(e.value);
             }

             gtag('event', 'search (boolean)');
             queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
         }} /></div>
}
export const FilterDateField = ({model, field, filterValues, onChangeFilterValue  }) => {
    const {t} = useTranslation();

    const [minDate ,setMinDate] = useState(null);
    const [maxDate ,setMaxDate] = useState(null);
    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            onChangeFilterValue(field, { });
            setMinDate('');
            setMaxDate('');
        }
    }, [filterValues]);
    const onChange =  (minDate, maxDate) =>{
        const min = minDate ? { $gte: ['$'+field.name, minDate]}  : null;

        const fm = new Date(maxDate);
        fm.setDate(fm.getDate() + 1);

        const max = maxDate ? {$lte: ['$' + field.name, fm.toISOString()]} : null;
        const and= [];
        if( min) and.push(min);
        if( max) and.push(max);
        if( !min && !max)
            onChangeFilterValue(field, { });
        else
            onChangeFilterValue(field, { $and: and});
        gtag('event', 'search (date)');
    }
    return <div className={"flex flex-no-gap flex-no-wrap"}>
        <label htmlFor={"minDate"+model.name+field.name}>
            Min:
            <input id={"minDate"+model.name+field.name} type={"datetime-local"} value={minDate} onChange={e => {
                setMinDate(e.target.value);
                onChange?.(e.target.value, maxDate);
            }} />
        </label>
        <label htmlFor={"maxDate"+model.name+field.name}>
            Max:
            <input id={"maxDate"+model.name+field.name} type={"datetime-local"} value={maxDate} onChange={e => {
                setMaxDate(e.target.value);
                onChange?.(minDate, e.target.value);
            }} />
        </label>
    </div>
}
export const FilterStringField = ({ field, onChangeFilterValue, filterValues, setFilterValues }) => {
    const { models, setPage } = useModelContext();
    const [isRegex, setIsRegex] = useState(false);
    const { t } = useTranslation();


    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            onChangeFilterValue(field, { });
        }
    }, [filterValues]);

    // Debounced function to apply the filter
    const debouncedApplyFilter = useCallback(
        debounce((currentValue, currentIsRegex) => {
            setPage(1); // Reset page to 1 when filter changes

            if (currentValue === '') {
                // No need to call setFilterValues here as it's done immediately in handleChange
                onChangeFilterValue(field, field.multiple ? [] : {}, true);
                return;
            }

            let filterQuery;
            if (field.type === 'relation') {
                const relationModel = models.find(f => f.name === field.relation);
                if (relationModel) {
                    const relationFilters = relationModel.fields
                        .filter(f => mainFieldsTypes.includes(f.type))
                        .map(mf => ({
                            $regexMatch: { input: `$$this.${mf.name}`, regex: currentIsRegex ? currentValue : escapeRegExp(currentValue) }
                        }));
                    if (relationFilters.length > 0) {
                        filterQuery = { [field.name]: {$find: { $and: [{ $or: relationFilters }] }}};
                    } else {
                        filterQuery = {}; // Or handle as no match if no searchable fields
                    }
                } else {
                    filterQuery = {}; // Relation model not found
                }
            } else { // Not a relation type
                const regexToUse = currentIsRegex ? currentValue : escapeRegExp(currentValue);
                if (field.type === 'array') {
                    filterQuery = {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: '$' + field.name,
                                        as: 'item',
                                        cond: {
                                            $regexMatch: {
                                                input: '$$item',
                                                regex: regexToUse
                                            }
                                        }
                                    }
                                }
                            },
                            0
                        ]
                    };
                } else { // Simple string field
                    filterQuery = {
                        $and: [{
                            $regexMatch: {
                                input: '$' + field.name,
                                regex: regexToUse
                            }
                        }]
                    };
                }
            }
            onChangeFilterValue(field, filterQuery, true);
            gtag('event', 'search (string)');
        }, 1200), // Debounce delay
        [] // Dependencies for useCallback
    );

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        // Update the displayed value immediately
        setFilterValues(filter => ({ ...filter, [field.name]: newValue }));
        // Call the debounced function to apply the filter
        debouncedApplyFilter(newValue, isRegex);
    };

    const handleToggleRegex = () => {
        const newIsRegex = !isRegex;
        setIsRegex(newIsRegex);
        // Re-apply filter with the new regex state and current value
        // The value from filterValues should be up-to-date
        const currentValue = filterValues[field.name] || '';
        debouncedApplyFilter(currentValue, newIsRegex);
    };

    return (
        <>
            <TextField
                type="text"
                name={`filter_${field.name}`}
                value={filterValues[field.name] || ''} // Ensure controlled component with a default empty string
                placeholder={isRegex ? t("filterstringfield.placeholder.regex", "regular expression") : t("filterstringfield.placeholder", "...")}
                onChange={handleInputChange}
                maxLength={1000}
            />
            <button title={"regex"} className={isRegex ? 'active' : ''} onClick={handleToggleRegex}>.*</button>
        </>
    );
};
export const FilterField = ({advanced,model, reversed, field, active, onChangeFilterValue, filterValues, setFilterValues}) => {
    const { elementsPerPage, pagedSort, setPagedSort, setPage, page, pagedFilters, lockedColumns, setLockedColumns } = useModelContext();
    const {t} = useTranslation();
    const [locked, setLocked] = useState(lockedColumns.includes(field.name));
    const queryClient = useQueryClient()

    useEffect(() => {
        if(!reversed) {
            setFilterValues(filter => ({...filter, [field.name]: ''}));
            onChangeFilterValue(field, '', true);
        }
    }, [field]);

    const handleToggleLock = () => {
        if( locked ) {
            if (lockedColumns.includes(field.name))
                setLockedColumns(cols => [...cols].filter(f => f !== field.name));
        }else{
            if (!lockedColumns.includes(field.name))
                setLockedColumns(cols => [...cols, field.name]);
        }
        setLocked(!locked);
    }

    const [reset, setReset] = useState(false);
    const handleChangeSort = (up) => {
        setPagedSort(sort => {
            const s = lockedColumns.length > 0 ? {...sort[model.name] || {}} : {};
            if( up ){
                if( reset ){
                    delete s[field.name];
                    setReset(false);
                }else {
                    s[field.name] = 1;
                }
            }else{
                s[field.name] = -1;
                setReset(true);
            }
            return {...sort, [model.name]: s};
        });
        queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
    }

    const resetClass = pagedSort[model.name]?.[field.name] ? (((pagedSort[model.name]?.[field.name] === 1) || (pagedSort[model.name]?.[field.name] === -1)) ? 'active' : 'reset') : '';

    const renderIconFromType =(field)=>{
        const type = field.type;
        if( type === 'color'){
            return <FaPallet/>;
        }
        if( type === 'code'){
            return <FaCode />;
        }
        else if( type === 'date'){
            return <FaCalendarWeek />;
        }else if( type === 'datetime'){
            return <FaCalendarDays />;
        }
        else if( type === 'richtext' || type === 'string' || type === 'string_t'){
            return <></>;
        }
        else if( type === 'url'){
            return <FaLink />;
        }
        else if( type === 'number'){
            return <FaHashtag />;
        }
        else if( type === 'file'){
            return <FaFile />;
        }
        else if( type === 'enum'){
            return <FaListUl />;
        }
        else if( type === 'boolean'){
            return <FaToggleOn />;
        }
        else if( type === 'image'){
            return <FaImage/>;
        }
        else if( type === 'relation'){
            return field.multiple ? <FaSitemap /> : <FaLink />;
        }
        else if( type === 'email'){
            return <FaAt />;
        }
        else if( type === 'phone'){
            return <FaPhone />;
        }
        else if( type === 'array'){
            return <FaTableColumns />;
        }
        return <FaPencil />
    }
    return <th key={field.name} className={`form filter-field`} style={{backgroundColor: field.color, color: !field.color ||isLightColor(field.color) ? 'black': "white"}}>
        <div className="flex flex-centered flex-mini-gap flex-row">
            <div className="flex flex-1 flex-mini-gap flex-no-wrap">
                {renderIconFromType(field)}
                <span title={field.name} className={"flex-1 title"}>{t(`field_${model.name}_${field.name}`, field.name)}</span>
            </div>
            {advanced && (<>
            { 'password'!==field.type && (<div className={"flex flex-no-gap"}>
                {(<>
                        {(pagedSort[model.name]?.[field.name] !== 1) &&
                            <button onClick={() => handleChangeSort(true)}
                                    className={resetClass}>
                                {pagedSort[model.name]?.[field.name] === undefined ? <FaArrowDown/> : <FaArrowUp/>}</button>}
                        {(pagedSort[model.name]?.[field.name] === 1) &&
                            <button onClick={() => handleChangeSort(false)}
                                    className={resetClass}>
                                <FaArrowDown/></button>}
                    </>
                )}
                {!field.unique && (
                    <button onClick={() => handleToggleLock()} className={locked ? 'active' : ''}><FaLock/></button>)}
            </div>)}
            {active && !['date','datetime','enum', 'boolean', 'number', 'password'].includes(field.type) && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterStringField setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'enum' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterEnumField model={model} setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'boolean' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterBooleanField filterValues={filterValues} model={model} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && ['date', 'datetime'].includes(field.type) && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterDateField filterValues={filterValues} model={model} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'number' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterNumberField model={model} setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            </>)}
        </div>
    </th>
}

export const PhoneField = ({name, value, onChange}) => {
    const [phone, setPhone] = useState(value);
    useEffect(() => {
        setPhone(value);
    }, [value]);
    return (
        <div>
            <PhoneInput
                defaultCountry="ua"
                value={phone || ''}
                onChange={(phone) => {
                    setPhone(phone);
                    onChange?.(phone);
                }}
            />
        </div>
    );
}

export const ModelField = ({field, formData, disableable=false, showModel=true, value, fields=false, onChange, ...rest}) => {
    const {models} = useModelContext();
    const {me} = useAuthContext();
    const {t} = useTranslation();
    const [checked, setChecked] = useState(true);

    // --- LOGIQUE AMÉLIORÉE POUR DÉTERMINER LE MODÈLE CIBLE ET LES VALEURS ---
    const hasTargetModel = !!field?.targetModel;
    let modelValue, fieldValue, targetModelName;

    if (hasTargetModel) {
        // Le modèle est déterminé par un autre champ. La valeur de ce champ est juste le nom du champ (string).
        if (typeof field.targetModel === 'string' && field.targetModel.startsWith('$')) {
            const dynamicFieldName = field.targetModel.substring(1);
            targetModelName = formData?.[dynamicFieldName] || null;
        } else {
            targetModelName = field.targetModel;
        }
        modelValue = targetModelName;
        fieldValue = value;
    } else {
        // La valeur de ce champ contient le modèle et/ou le champ.
        if (fields) { // fields=true: on sélectionne un modèle ET un champ. La valeur est un objet.
            targetModelName = value?.model;
            modelValue = value?.model;
            fieldValue = value?.field;
        } else { // fields=false: on sélectionne seulement un modèle. La valeur est une chaîne.
            targetModelName = value;
            modelValue = value;
            fieldValue = undefined;
        }
    }

    const selectedModel = models.find(m => m.name === targetModelName); // Note: Removed user check for broader compatibility with system models

    // Préparer les options pour les champs du modèle
    const fieldOptions = selectedModel?.fields.map(f => ({
        label: t(`field_${selectedModel.name}_${f.name}`, f.name),
        value: f.name
    })) || [];

    // Effet pour réinitialiser le champ si le modèle cible change et que le champ actuel n'est plus valide
    useEffect(() => {
        if (hasTargetModel) {
            const isValid = fieldOptions.some(opt => opt.value === fieldValue);
            if (!isValid) {
                const newValue = fieldOptions.length > 0 ? fieldOptions[0].value : null;
                if (fieldValue !== newValue) {
                    onChange({ name: field.name, value: newValue });
                }
            }
        }
    }, [targetModelName]); // Se déclenche quand le nom du modèle cible change

    // Gestion du changement de modèle (uniquement si pas de targetModel)
    const handleModelChange = (e) => {
        const newModelName = e.value;
        const newModel = models.find(m => m.name === newModelName);
        const firstField = newModel?.fields[0]?.name || null;

        if (fields) {
            onChange({name: field?.name, value: { model: newModelName, field: firstField }});
        } else {
            onChange({name: field?.name, value: newModelName});
        }
    };

    // Gestion du changement de champ
    const handleFieldChange = (e) => {
        const newFieldName = e.value;
        if (hasTargetModel) {
            onChange({ name: field.name, value: newFieldName });
        } else {
            onChange({name: field?.name, value: { model: modelValue, field: newFieldName }});
        }
    };

    const dis = disableable ? (<CheckboxField
        checked={checked}
        onChange={e => {
            setChecked(e);
            if (!e) {
                onChange({name: field?.name, value: null});
            }
        }}
    />) : null;

    if (!fields) {
        return (<div className="flex flex-1">
            {dis}
            {checked && (<SelectField
                className="flex-1"
                value={modelValue}
                onChange={handleModelChange}
                items={models
                    .filter(m => m._user === me?.username) // Keep user filter for selection
                    .map(m => ({
                        label: t(`model_${m.name}`, m.name),
                        value: m.name
                    }))}
                {...rest}
            />)}
        </div>);
    }

    return (<div className="flex flex-1">
        {dis}
        {checked && (<div className="flex flex-stretch" key={field?.name ?? 'def'}>
            {showModel && (<SelectField
                className="flex-1"
                value={modelValue}
                onChange={handleModelChange}
                items={models
                    .filter(m => m._user === me?.username) // Keep user filter for selection
                    .map(m => ({
                        label: t(`model_${m.name}`, m.name),
                        value: m.name
                    }))}
                disabled={hasTargetModel} // Le sélecteur de modèle est désactivé si le modèle est piloté par un autre champ
            />)}
            <SelectField
                className="flex-1"
                value={fieldValue}
                onChange={handleFieldChange}
                items={fieldOptions}
                disabled={!targetModelName}
                {...rest}
            />
        </div>)}
    </div>);
};

// Fonction pour obtenir le composant icône par son nom
const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const IconComponent = FaIcons[iconName] || Fa6Icons[iconName];
    return IconComponent ? <IconComponent /> : null; // Retourne l'élément React ou null
};
export const IconField = ({name, label, value, disabled, onChange, className, ...rest}) => {
    const { t } = useTranslation();
    const [iconSuggestions, setIconSuggestions] = useState([]);
    // Tri alphabétique pour une recherche plus prévisible
    const [allFaIcons] = useState(() => [...Object.keys(FaIcons), ...Object.keys(Fa6Icons)].sort());

    const handleIconChange = (e) => {
        const value = e.target.value;
        onChange(value);
        if (value) {
            const filtered = allFaIcons.filter(
                icon => icon.toLowerCase().includes(value.toLowerCase())
            );
            setIconSuggestions(filtered.slice(0, 20));
        } else {
            setIconSuggestions([]);
        }
    };

    const handleIconFocus = () => {
        if (value) {
            const filtered = allFaIcons.filter(
                icon => icon.toLowerCase().includes(value.toLowerCase())
            );
            setIconSuggestions(filtered.slice(0, 20));
        } else {
            setIconSuggestions(allFaIcons.slice(0, 10));
        }
    };

    const onSuggestionClick = (suggestion) => {
        onChange(suggestion);
        setIconSuggestions([]);
    };

    return <div className="textfield-wrapper with-suggestions">
        <div className={"flex flex-1 flex-no-wrap"}>
            <TextField
                help={t('modelcreator.field.icon')}
                id="modelIcon"
                disabled={disabled}
                value={value}
                label={label}
                before={<div>{getIconComponent(value)}</div>}
                onChange={handleIconChange}
                onFocus={handleIconFocus}
                onBlur={() => setTimeout(() => setIconSuggestions([]), 200)}
                autoComplete="off"
            />
        </div>
        {iconSuggestions.length > 0 && (
            <ul className="suggestions-list">
                {iconSuggestions.map(icon => (
                    <li key={icon} onMouseDown={() => onSuggestionClick(icon)}>
                        <span className="suggestion-icon">{getIconComponent(icon)}</span>
                        <span>{icon}</span>
                    </li>
                ))}
            </ul>
        )}
    </div>
};

export const ColorField = ({ name, label, value, disabled, onChange, className, ...rest }) => {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);

    const handleClick = () => {
        if (!disabled) {
            setDisplayColorPicker(!displayColorPicker);
        }
    };

    const handleClose = () => {
        setDisplayColorPicker(false);
    };

    const handleChange = (color) => {
        // react-color nous donne un objet avec tous les formats.
        // On utilise tinycolor pour le convertir au format canonique attendu par le backend (#RRGGBBAA).
        const newColor = tinycolor(color.rgb); // color.rgb contient {r, g, b, a}
        onChange?.({ name, value: newColor.toHex8String().toUpperCase() });
    };

    const color = tinycolor(value || '#FFFFFFFF');
    const swatchStyle = {
        background: color.toRgbString(),
        width: '100%',
        minWidth: '52px',
        height: '36px',
        borderRadius: '2px',
        border: '1px solid #ccc',
        cursor: disabled ? 'not-allowed' : 'pointer',
    };

    return (
        <div className={`flex flex-1 flex-no-wrap ${className || ''}`}>
            {label && (<label className="flex-1 mb-1">{label}</label>)}
            <div style={swatchStyle} onClick={handleClick}>&nbsp;</div>
            <div className={"flex-1"}>{value}</div>
            {displayColorPicker ? (
                <div style={{ position: 'absolute', zIndex: '2' }}>
                    <div style={{ position: 'fixed', top: '0px', right: '0px', bottom: '0px', left: '0px' }} onClick={handleClose} />
                    <SketchPicker color={value || '#FFFFFFFF'} onChange={handleChange} />
                </div>
            ) : null}
        </div>
    );
};

const secondsToDuration = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds === '') {
        return { days: '', hours: '', minutes: '', seconds: '' };
    }
    const total = parseInt(totalSeconds, 10);
    const d = Math.floor(total / 86400);
    let remainder = total % 86400;
    const h = Math.floor(remainder / 3600);
    remainder %= 3600;
    const m = Math.floor(remainder / 60);
    const s = remainder % 60;
    return { days: d, hours: h, minutes: m, seconds: s };
};

const durationToSeconds = ({ days, hours, minutes, seconds }) => {
    return (parseInt(days, 10) || 0) * 86400 +
           (parseInt(hours, 10) || 0) * 3600 +
           (parseInt(minutes, 10) || 0) * 60 +
           (parseInt(seconds, 10) || 0);
};

export const DurationField = forwardRef(({ value, onChange, name, label, help, required, editable, readOnly }, ref) => {
    const { t } = useTranslation();
    const [duration, setDuration] = useState(secondsToDuration(value));
    const [errors, setErrors] = useState([]);

    useEffect(() => {
        setDuration(secondsToDuration(value));
    }, [value]);

    const validate = () => {
        const errs = [];
        const totalSeconds = durationToSeconds(duration);
        if (required && totalSeconds <= 0) {
            errs.push(t('form.validation.required', "Field required"));
        }
        setErrors(errs);
        return !errs.length;
    };

    useImperativeHandle(ref, () => ({
        validate,
        getValue: () => durationToSeconds(duration),
    }));

    const handlePartChange = (part) => (e) => {
        const newDuration = { ...duration, [part]: e.target.value };
        setDuration(newDuration);
        if (onChange) {
            const totalSeconds = durationToSeconds(newDuration);
            onChange({ name, value: totalSeconds });
        }
    };

    return (
        <>
            <div className={cn({ field: true, "field-duration": true, 'flex-1': true, flex: true, "field-bg": true })}>
                {label && (
                    <label contentEditable={editable} className={cn({ help: !!help, 'flex-1': true })}>
                        {label}
                        {required && <span className="mandatory" contentEditable={false}>*</span>}
                    </label>
                )}
                {help && <div className="flex help">{help}</div>}
                <div className="duration-inputs flex flex-no-wrap flex-mini-gap">
                    <NumberField name={`${name}-days`} unit={t('duration.unit.days', 'days')} value={duration.days} onChange={handlePartChange('days')} readOnly={readOnly} min={0} />
                    <NumberField name={`${name}-hours`} unit={t('duration.unit.hours', 'hours')} value={duration.hours} onChange={handlePartChange('hours')} readOnly={readOnly} min={0} max={23} />
                    <NumberField name={`${name}-minutes`} unit={t('duration.unit.minutes', 'minutes')} value={duration.minutes} onChange={handlePartChange('minutes')} readOnly={readOnly} min={0} max={59} />
                    <NumberField name={`${name}-seconds`} unit={t('duration.unit.seconds', 'seconds')} value={duration.seconds} onChange={handlePartChange('seconds')} readOnly={readOnly} min={0} max={59} />
                </div>
            </div>
            {errors.length > 0 && (
                <ul className="error">
                    {errors.map((e, key) => (
                        <li key={key} aria-live="assertive" role="alert">{e}</li>
                    ))}
                </ul>
            )}
        </>
    );
});
DurationField.displayName = "DurationField";

export const CodeField = ({name, label, language, defaultValue, value, disabled, onChange}) => {
    const u = name || uniqid();
    const [currentEditor, setEditor] = useState(null);

    return <>
        {label && (<label className="flex flex-1">{label}</label>)}
        {!disabled ? <div className={"codefield"}><span><b>{language}</b> : </span><CodeiumEditor
            language={language || 'json'}
            theme={"vs-dark"}
            value={value}
            onChange={e => {
                if (language === 'json') {
                    let code;
                    try {
                        code = JSON.parse(e);
                        onChange({name, value: code});
                    } catch (e) {
                    }
                } else {
                    onChange({name, value: e});
                }
            }}
            height="300px"
        /></div> : <div className="code"><SyntaxHighlighter
            language={language || "javascript"}>{value}</SyntaxHighlighter></div>
        }</>
}

export const EnumField = ({inputProps, value, handleChange, field}) => {
    const { t} = useTranslation()
    useEffect(() => {
        if( field.items.includes(value))
            handleChange(value);
        else{
            handleChange({name: field.name, value: field.items[0]})
        }
    }, []);
    return (
        <select {...inputProps} onChange={(e) => handleChange({name: field.name, value: e.target.value})} >{(field.items || []).map(item => {
            if( typeof(item) === 'string'){
                return <option value={item}>{t(item, item)}</option>;
            }
            return <></>
        })}</select>
    );
}

export const RangeField = ({ name, value, onChange, min = 0, max = 100, step = 1, percent = false }) => {
    const handleChange = (e) => {
        // The onChange from the form probably expects the field name and value
        onChange(parseFloat(e.target.value));
    };

    const percentage = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
    const displayValue = percent ? `${Math.round(percentage)}%` : value;

    return (
        <div className="range-field">
            <input
                type="range"
                name={name}
                value={value || 0}
                onChange={handleChange}
                min={min}
                max={max}
                step={step}
            />
            <span className="range-value">{displayValue}</span>
        </div>
    );
};