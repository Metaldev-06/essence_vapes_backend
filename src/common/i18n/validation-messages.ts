import type { ValidationError } from 'class-validator';

/**
 * Translates class-validator's auto-generated English messages into Spanish, so every DTO -
 * current and future - rejects bad input in Spanish without each decorator needing its own
 * hand-written `message:` option.
 *
 * class-validator only exposes the already-rendered sentence per constraint
 * (`error.constraints[key]`), not its raw arguments. For each known key we first check whether
 * that sentence is exactly (or, for templated ones, in the shape of) class-validator's own
 * default English text - if it's not, it must be a custom `message:` someone already wrote (in
 * Spanish, per this codebase's convention), so it's passed through untouched instead of being
 * clobbered by the generic translation below.
 */
export const translateValidationErrors = (
  errors: ValidationError[],
): string[] => errors.flatMap((error) => flattenError(error));

const flattenError = (
  error: ValidationError,
  parentPath?: string,
): string[] => {
  const path = parentPath ? `${parentPath}.${error.property}` : error.property;

  const ownMessages = Object.entries(error.constraints ?? {}).map(
    ([key, message]) => translateConstraint(path, key, message),
  );

  const childMessages = (error.children ?? []).flatMap((child) =>
    flattenError(child, path),
  );

  return [...ownMessages, ...childMessages];
};

// Constraints whose default English message is a single fixed sentence (no dynamic part),
// so a custom message can be told apart with a plain equality check.
const FIXED_DEFAULTS: Record<
  string,
  { english: (p: string) => string; spanish: (p: string) => string }
> = {
  isNotEmpty: {
    english: (p) => `${p} should not be empty`,
    spanish: (p) => `${p} no puede estar vacío`,
  },
  isString: {
    english: (p) => `${p} must be a string`,
    spanish: (p) => `${p} debe ser un texto`,
  },
  isEmail: {
    english: (p) => `${p} must be an email`,
    spanish: (p) => `${p} debe ser un email válido`,
  },
  isInt: {
    english: (p) => `${p} must be an integer number`,
    spanish: (p) => `${p} debe ser un número entero`,
  },
  isNumber: {
    english: (p) =>
      `${p} must be a number conforming to the specified constraints`,
    spanish: (p) => `${p} debe ser un número`,
  },
  isPositive: {
    english: (p) => `${p} must be a positive number`,
    spanish: (p) => `${p} debe ser un número positivo`,
  },
  isBoolean: {
    english: (p) => `${p} must be a boolean value`,
    spanish: (p) => `${p} debe ser verdadero o falso`,
  },
  isArray: {
    english: (p) => `${p} must be an array`,
    spanish: (p) => `${p} debe ser una lista`,
  },
};

const translateConstraint = (
  property: string,
  key: string,
  message: string,
): string => {
  const fixed = FIXED_DEFAULTS[key];
  if (fixed) {
    return message === fixed.english(property)
      ? fixed.spanish(property)
      : message;
  }

  // Everything below interpolates a length, a number, an enum's values or a regex into the
  // default sentence, so it's detected (and its dynamic part recovered) with a pattern instead.
  switch (key) {
    case 'isEnum':
    case 'isIn': {
      const values = /^.+ must be one of the following values: (.+)$/.exec(
        message,
      )?.[1];
      return values
        ? `${property} debe ser uno de los siguientes valores: ${values}`
        : message;
    }

    case 'minLength': {
      const n = /^.+ must be longer than or equal to (\d+) characters$/.exec(
        message,
      )?.[1];
      return n ? `${property} debe tener al menos ${n} caracteres` : message;
    }
    case 'maxLength': {
      const n = /^.+ must be shorter than or equal to (\d+) characters$/.exec(
        message,
      )?.[1];
      return n ? `${property} debe tener como máximo ${n} caracteres` : message;
    }
    case 'min': {
      const n = /^.+ must not be less than (-?\d+(?:\.\d+)?)$/.exec(
        message,
      )?.[1];
      return n ? `${property} debe ser mayor o igual a ${n}` : message;
    }
    case 'max': {
      const n = /^.+ must not be greater than (-?\d+(?:\.\d+)?)$/.exec(
        message,
      )?.[1];
      return n ? `${property} debe ser menor o igual a ${n}` : message;
    }
    case 'arrayMinSize': {
      const n = /^.+ must contain at least (\d+) elements$/.exec(message)?.[1];
      return n ? `${property} debe contener al menos ${n} elementos` : message;
    }
    case 'arrayMaxSize': {
      const n = /^.+ must contain not more than (\d+) elements$/.exec(
        message,
      )?.[1];
      return n
        ? `${property} debe contener como máximo ${n} elementos`
        : message;
    }

    case 'matches':
      return /^.+ must match .+ regular expression$/.exec(message)
        ? `${property} tiene un formato inválido`
        : message;

    case 'whitelistValidation':
      return message === `property ${property} should not exist`
        ? `${property} no es un campo permitido`
        : message;

    default:
      // An unrecognized constraint key - pass it through rather than guess. Every decorator
      // actually used in this codebase is handled above; if a new one lacks a Spanish
      // `message:` option (the established convention), add its key here instead of guessing.
      return message;
  }
};
