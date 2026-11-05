import { createElement } from "react";
import * as lucideIcons from "lucide-react";
import PropTypes from "prop-types";

// An unknown icon name must never take the whole app down: warn and draw a plain circle instead.
function Lucide(props) {
  const { icon, className, ...computedProps } = props;
  const Icon = lucideIcons[icon] || lucideIcons.Circle;
  if (!lucideIcons[icon]) console.warn(`Lucide icon '${icon}' not found.`);
  return createElement(Icon, { ...computedProps, className: `lucide ${className}` });
}

Lucide.propTypes = {
  icon: PropTypes.string,
  className: PropTypes.string,
};

Lucide.defaultProps = {
  icon: "",
  className: "",
};

export default Lucide;
