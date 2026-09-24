FROM php:8.3-apache

# install-php-extensions instala binarios precompilados en vez de compilar
# gd/zip desde código fuente con docker-php-ext-install (mucho más rápido de buildear).
COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions zip gd pdo_mysql \
    && a2enmod rewrite

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --optimize-autoloader

# El docroot de Apache queda parado en la raíz del proyecto (no en app/api/)
# para que rutas relativas tipo __DIR__ . '/../../logs' sigan siendo válidas,
# igual que en el XAMPP original. nginx es quien expone solo /app/api/ hacia afuera.
COPY app ./app
COPY logs ./logs
COPY .htaccess ./.htaccess

ENV APACHE_DOCUMENT_ROOT=/var/www/html
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# El .env vive dentro del docroot (para que __DIR__ . '/../../' siga apuntando ahí desde
# app/api/*.php, igual que en XAMPP). La imagen base de Apache trae "Options Indexes"
# habilitado para el docroot y el .htaccess del proyecto no aplica (AllowOverride None
# en apache2.conf), así que sin esto cualquiera que le pegue directo al contenedor PHP
# (red interna de Docker; nginx solo expone /app/api/ hacia afuera) podría listar el
# directorio o descargar el .env si algún día se le da permiso de lectura a www-data.
RUN printf '\n<Directory "%s">\n    Options -Indexes +FollowSymLinks\n</Directory>\n\n<Files ".env">\n    Require all denied\n</Files>\n' "$APACHE_DOCUMENT_ROOT" >> /etc/apache2/apache2.conf

EXPOSE 80
