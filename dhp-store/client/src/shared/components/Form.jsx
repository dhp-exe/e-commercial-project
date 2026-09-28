import React from 'react';

const Form = ({ onSubmit, children, className, style, ...props }) => {
  return (
    <form onSubmit={onSubmit} className={className} style={style} {...props}>
      {children}
    </form>
  );
};

export default Form;
